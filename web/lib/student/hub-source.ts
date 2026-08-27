import type { SupabaseClient } from '@supabase/supabase-js'
import type { HubTabKey } from '@/lib/student/hub'

// What every tab of বার্তা ও অনুরোধ needs before it can render its own tab bar:
// the two queue counts, and whether the caller reaches any class at all.
//
// Scoping is not done here and must not be. 0152 scopes both tables in RLS, so a
// `head: true` count already answers "my backlog" for a teacher and "the
// school's" for the Owner, without this file knowing which one is asking. That
// is the difference between the section being correct and the *page* being
// correct (ADR 0018).

export interface HubSummary {
  /** Unanswered questions in the caller's scope. */
  questions: number | null
  /** Pending correction requests in the caller's scope. */
  corrections: number | null
  /** False when the caller holds no class attachment anywhere — the section is
   *  legitimately empty and has to say why (#509). */
  reachesAnyClass: boolean
}

/**
 * Two counts, and the reach flag.
 *
 * `skip` drops the count for the tab that is already holding the rows it would
 * have counted — the questions page knows its own backlog without asking twice.
 * The remaining query is `head: true`, so it is a count and not a fetch.
 */
export async function hubSummary(
  supabase: SupabaseClient,
  { skip, known }: { skip?: HubTabKey; known?: number } = {},
): Promise<HubSummary> {
  const [questions, corrections, reach] = await Promise.all([
    skip === 'questions'
      ? Promise.resolve({ count: known ?? null })
      : supabase
          .from('student_messages')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'answered'),
    skip === 'corrections'
      ? Promise.resolve({ count: known ?? null })
      : supabase
          .from('student_profile_change_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
    supabase.rpc('staff_reaches_any_class'),
  ])

  return {
    questions: questions.count ?? null,
    corrections: corrections.count ?? null,
    // Null (the RPC missing, or an error) reads as "reaches something": the
    // fallback line is a helpful explanation, not a gate, and showing it to a
    // Class Teacher who does have classes would be worse than not showing it.
    reachesAnyClass: (reach as { data?: boolean | null }).data !== false,
  }
}
