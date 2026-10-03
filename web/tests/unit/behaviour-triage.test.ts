import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { noteHash, triageView, type BehaviourTriage } from '@/lib/behaviour-triage'
import { judgeBehaviourNote, recordBehaviourTriage, triageClient } from '@/lib/behaviour-triage-service'

// Seam: the advisory Behaviour Log triage (issue #672) — the pure policy that
// turns TypeSafe's typed answers into hints, and the fail-open service around
// the call. The model itself is faked; its quality is the eval script's job.

const NOTE = 'Hit a classmate during break'

function triage(overrides: Partial<BehaviourTriage> = {}): BehaviourTriage {
  return {
    note_sha256: noteHash(NOTE),
    model: 'jev-test',
    severity: 3.2,
    severity_confidence: 0.8,
    severity_probs: { 0: 0, 1: 0, 2: 0.1, 3: 0.6, 4: 0.3 },
    parent_contact_p: 0.9,
    category: 'conduct',
    category_confidence: 0.8,
    category_probs: { conduct: 0.8, bullying: 0.2 },
    ...overrides,
  }
}

describe('triageView: code owns every threshold', () => {
  it('shows nothing without a triage row', () => {
    expect(triageView(null, { note: NOTE, rating: 2 }, false)).toBeNull()
  })

  it('hides advice made on an earlier version of the note', () => {
    expect(triageView(triage(), { note: `${NOTE} (edited)`, rating: 2 }, false)).toBeNull()
  })

  it('maps confident answers to hints', () => {
    expect(triageView(triage(), { note: NOTE, rating: 2 }, false)).toEqual({
      severityLevel: 3,
      parentContact: 'suggested',
      category: 'conduct',
      mismatch: null,
    })
  })

  it('bands the guardian-contact probability', () => {
    const view = (p: number) => triageView(triage({ parent_contact_p: p }), { note: NOTE, rating: 2 }, false)!
    expect(view(0.7).parentContact).toBe('suggested')
    expect(view(0.5).parentContact).toBe('uncertain')
    expect(view(0.3).parentContact).toBe('notSuggested')
  })

  it('leaves a low-confidence category unclassified', () => {
    const view = triageView(triage({ category_confidence: 0.4 }), { note: NOTE, rating: 2 }, false)!
    expect(view.category).toBe('unclassified')
  })

  it('flags a serious note rated excellent', () => {
    expect(triageView(triage(), { note: NOTE, rating: 9 }, false)!.mismatch).toBe('seriousNoteHighRating')
  })

  it('flags a positive note rated needs-improvement', () => {
    const positive = triage({ severity: 0.1, category: 'positive', parent_contact_p: 0.05 })
    expect(triageView(positive, { note: NOTE, rating: 3 }, false)!.mismatch).toBe('positiveNoteLowRating')
  })

  it('does not flag ratings in the middle band', () => {
    expect(triageView(triage(), { note: NOTE, rating: 6 }, false)!.mismatch).toBeNull()
  })

  it('no mismatch once the entry is locked — it can no longer be corrected', () => {
    expect(triageView(triage(), { note: NOTE, rating: 9 }, true)!.mismatch).toBeNull()
  })

  it('an uncertain severity shows no level and raises no mismatch', () => {
    const view = triageView(triage({ severity_confidence: 0.3 }), { note: NOTE, rating: 9 }, false)!
    expect(view.severityLevel).toBeNull()
    expect(view.mismatch).toBeNull()
  })
})

const API_ANSWER = {
  model: 'jev-1.13.0',
  answers: {
    severity: {
      type: 'score',
      score: 3.2,
      confidence: 0.8,
      legend: {},
      probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.6, 4: 0.3 },
    },
    parent_contact: { type: 'noul', noul: 0.9 },
    category: { type: 'choice', choice: 'conduct', confidence: 0.8, probabilities: { conduct: 0.8 } },
  },
  usage: { input_tokens: 200, output_tokens: 0 },
}

function fakeClient(fetch: (url: string, init?: RequestInit) => Promise<Response>, timeout = 2000) {
  return new TypeSafeClient({ apiKey: 'test-key', fetch, timeout, retry: { maxRetries: 0 }, logLevel: 'off' })
}

describe('judgeBehaviourNote: one request, the note only, fail-open', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends only the note — no rating, name or ids — and maps the answers', async () => {
    let sent: { state: unknown; questions: Record<string, unknown> } | undefined
    const client = fakeClient(async (_url, init) => {
      sent = JSON.parse(String(init!.body))
      return Response.json(API_ANSWER)
    })
    const result = await judgeBehaviourNote(NOTE, client)
    expect(sent!.state).toEqual({ note: NOTE })
    expect(Object.keys(sent!.questions).sort()).toEqual(['category', 'parent_contact', 'severity'])
    expect(result).toMatchObject({
      note_sha256: noteHash(NOTE),
      model: 'jev-1.13.0',
      severity: 3.2,
      parent_contact_p: 0.9,
      category: 'conduct',
    })
  })

  it('returns null on an API error, logging only the error class', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = fakeClient(async () => new Response('boom', { status: 500 }))
    expect(await judgeBehaviourNote(NOTE, client)).toBeNull()
    expect(warn.mock.calls.flat().join(' ')).not.toContain(NOTE)
  })

  it('returns null when the call exceeds its timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = fakeClient(
      (_url, init) =>
        new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))),
      20,
    )
    expect(await judgeBehaviourNote(NOTE, client)).toBeNull()
  })

  it('has no client without an API key', () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    expect(triageClient()).toBeNull()
    vi.unstubAllEnvs()
  })
})

/** A just-enough stand-in for the Supabase chains recordBehaviourTriage uses. */
function fakeSupabase(flagEnabled: boolean | null) {
  const upserts: unknown[] = []
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'students') return { data: { school_id: 'school-1' } }
          return { data: flagEnabled === null ? null : { enabled: flagEnabled } }
        },
        upsert: async (row: unknown) => {
          upserts.push(row)
          return { error: null }
        },
      }
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient, upserts }
}

describe('recordBehaviourTriage: gated, never throws', () => {
  const entry = { id: 'entry-1', studentId: 'student-1', note: NOTE }

  it('does not call TypeSafe when the school has no flag row (the default)', async () => {
    const { client, upserts } = fakeSupabase(null)
    const judge = vi.fn()
    await recordBehaviourTriage(client, entry, judge)
    expect(judge).not.toHaveBeenCalled()
    expect(upserts).toEqual([])
  })

  it('does not call TypeSafe when the flag is off', async () => {
    const { client } = fakeSupabase(false)
    const judge = vi.fn()
    await recordBehaviourTriage(client, entry, judge)
    expect(judge).not.toHaveBeenCalled()
  })

  it('stores the judgment against the entry when on', async () => {
    const { client, upserts } = fakeSupabase(true)
    await recordBehaviourTriage(client, entry, async () => triage())
    expect(upserts).toHaveLength(1)
    expect(upserts[0]).toMatchObject({ entry_id: 'entry-1', category: 'conduct', note_sha256: noteHash(NOTE) })
  })

  it('writes nothing when the judgment failed', async () => {
    const { client, upserts } = fakeSupabase(true)
    await recordBehaviourTriage(client, entry, async () => null)
    expect(upserts).toEqual([])
  })

  it('swallows an unexpected throw — the saved entry is unaffected', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = fakeSupabase(true)
    await expect(
      recordBehaviourTriage(client, entry, async () => {
        throw new Error('unexpected')
      }),
    ).resolves.toBeUndefined()
  })
})
