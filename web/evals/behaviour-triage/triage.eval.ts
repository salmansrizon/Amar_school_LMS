import { describe, it, expect } from 'vitest'
import { TRIAGE_THRESHOLDS, triageView, type BehaviourTriage } from '@/lib/behaviour-triage'
import { judgeBehaviourNote, triageClient } from '@/lib/behaviour-triage-service'
import { CASES, type TriageCase } from './cases'

// Manual eval of the advisory triage against labelled notes (issue #672).
//   npm run eval:behaviour-triage
// Needs TYPESAFE_API_KEY in .env.local; sends every note in cases.ts to
// TypeSafe. Not part of `npm test` or CI. It prints a report and records
// results; it does not pass or fail on accuracy — a person reads the report
// and decides whether the behaviour_ai_triage flag may be enabled anywhere.

interface Outcome {
  c: TriageCase
  triage: BehaviourTriage | null
  category: boolean
  severity: boolean
  contact: boolean | null
  mismatch: boolean
}

function score(c: TriageCase, triage: BehaviourTriage | null): Outcome {
  if (!triage) return { c, triage, category: false, severity: false, contact: false, mismatch: false }
  // Evaluate what staff would actually see: the app's own view with thresholds.
  const view = triageView(triage, { note: c.note, rating: c.rating }, false)!
  const level = view.severityLevel
  const p = triage.parent_contact_p
  return {
    c,
    triage,
    category: (c.categories as string[]).includes(view.category),
    severity: level !== null && level >= c.severity[0] && level <= c.severity[1],
    contact:
      c.contactGuardian === null
        ? null
        : c.contactGuardian
          ? p >= TRIAGE_THRESHOLDS.parentContactSuggested
          : p <= TRIAGE_THRESHOLDS.parentContactNotSuggested,
    mismatch: view.mismatch === c.mismatch,
  }
}

function rate(outcomes: Outcome[], key: 'category' | 'severity' | 'contact' | 'mismatch'): string {
  const scored = outcomes.filter((o) => o[key] !== null)
  const hit = scored.filter((o) => o[key] === true).length
  return scored.length ? `${hit}/${scored.length}` : '—'
}

describe.skipIf(!process.env.TYPESAFE_API_KEY)('Behaviour triage eval (#672)', () => {
  it('judges every labelled note and reports accuracy by language', { timeout: 180_000 }, async () => {
    const client = triageClient()
    const outcomes: Outcome[] = []
    for (const c of CASES) outcomes.push(score(c, await judgeBehaviourNote(c.note, client)))

    console.table(
      outcomes.map((o) => ({
        id: o.c.id,
        cat: o.triage ? `${o.triage.category} ${o.triage.category_confidence.toFixed(2)}` : 'FAILED',
        sev: o.triage ? `${o.triage.severity.toFixed(2)} c${o.triage.severity_confidence.toFixed(2)}` : '',
        contactP: o.triage ? o.triage.parent_contact_p.toFixed(2) : '',
        ok: [o.category ? '' : 'CAT', o.severity ? '' : 'SEV', o.contact === false ? 'CONTACT' : '', o.mismatch ? '' : 'MISMATCH']
          .filter(Boolean)
          .join(' ') || 'ok',
      })),
    )
    const byLang = ['bn', 'mixed', 'en', 'all'].map((lang) => {
      const group = lang === 'all' ? outcomes : outcomes.filter((o) => o.c.lang === lang)
      return {
        lang,
        n: group.length,
        failedCalls: group.filter((o) => !o.triage).length,
        category: rate(group, 'category'),
        severity: rate(group, 'severity'),
        contact: rate(group, 'contact'),
        mismatch: rate(group, 'mismatch'),
      }
    })
    console.table(byLang)

    expect(outcomes).toHaveLength(CASES.length)
  })
})
