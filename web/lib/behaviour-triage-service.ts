// Server side of the Behaviour Log advisory triage (issue #672): the TypeSafe
// call and the write of its result. Import only from server actions — the
// client reads TYPESAFE_API_KEY, which must never reach the browser.
//
// Fail-open throughout: the entry is already saved before anything here runs,
// and every failure (flag off, no key, timeout, API error, write refused) ends
// with no triage row rather than an error for the teacher.

import type { SupabaseClient } from '@supabase/supabase-js'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import {
  BEHAVIOUR_TRIAGE_FLAG,
  BEHAVIOUR_TRIAGE_QUESTIONS,
  noteHash,
  type BehaviourTriage,
} from '@/lib/behaviour-triage'

/** Total budget for the judgment: one attempt, no retries, so the save the
 *  teacher is waiting on is delayed by at most this much. */
export const TRIAGE_TIMEOUT_MS = 2000

/** Null when TYPESAFE_API_KEY is unset — triage is then simply skipped. */
export function triageClient(): TypeSafeClient | null {
  if (!process.env.TYPESAFE_API_KEY?.trim()) return null
  return new TypeSafeClient({
    timeout: TRIAGE_TIMEOUT_MS,
    retry: { maxRetries: 0 },
    // Request bodies carry notes about children; keep the SDK from logging
    // them whatever TYPESAFE_LOG_LEVEL says.
    logLevel: 'off',
  })
}

/** Ask the three questions of the note alone — no name, id, class or rating.
 *  Null on any failure. */
export async function judgeBehaviourNote(
  note: string,
  client: TypeSafeClient | null = triageClient(),
): Promise<BehaviourTriage | null> {
  if (!client) return null
  try {
    const { model, answers } = await client.systemOne({
      state: { note },
      questions: BEHAVIOUR_TRIAGE_QUESTIONS,
    })
    const { severity, parent_contact, category } = answers
    return {
      note_sha256: noteHash(note),
      model,
      severity: severity.score,
      severity_confidence: severity.confidence,
      severity_probs: { ...severity.probabilities },
      parent_contact_p: parent_contact.noul,
      category: category.choice,
      category_confidence: category.confidence,
      category_probs: { ...category.probabilities },
    }
  } catch (err) {
    // The error class only — never the message or body, which may echo the note.
    console.warn(`behaviour triage skipped: ${err instanceof Error ? err.name : 'unknown error'}`)
    return null
  }
}

async function triageEnabledFor(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  const { data: student } = await supabase.from('students').select('school_id').eq('id', studentId).maybeSingle()
  if (!student) return false
  const { data: flag } = await supabase
    .from('school_feature_flags')
    .select('enabled')
    .eq('school_id', student.school_id)
    .eq('flag_key', BEHAVIOUR_TRIAGE_FLAG)
    .maybeSingle()
  return flag?.enabled === true
}

/** Judge a just-saved entry and store the advice. Runs with the caller's own
 *  client, so RLS decides whether the row may be written. Never throws. */
export async function recordBehaviourTriage(
  supabase: SupabaseClient,
  entry: { id: string; studentId: string; note: string },
  judge: (note: string) => Promise<BehaviourTriage | null> = judgeBehaviourNote,
): Promise<void> {
  try {
    if (!(await triageEnabledFor(supabase, entry.studentId))) return
    const triage = await judge(entry.note)
    if (!triage) return
    const { error } = await supabase
      .from('behaviour_entry_triage')
      .upsert({ entry_id: entry.id, ...triage, created_at: new Date().toISOString() }, { onConflict: 'entry_id' })
    if (error) console.warn(`behaviour triage not stored: ${error.code ?? 'error'}`)
  } catch (err) {
    console.warn(`behaviour triage skipped: ${err instanceof Error ? err.name : 'unknown error'}`)
  }
}
