import type { SupabaseClient } from '@supabase/supabase-js'
import type { StudentTask } from '@/lib/student/tasks'

/** The Student's homework, with their own completion joined on. Two reads
 *  rather than an embedded join: the completion table is keyed by student and
 *  publication, and PostgREST cannot express "mine only" on an embed. */
export async function loadStudentTasks(supabase: SupabaseClient): Promise<StudentTask[]> {
  const [tasks, done, submitted] = await Promise.all([
    supabase
      .from('publications')
      .select('id, title, content, due_at, created_at')
      .eq('kind', 'homework')
      .order('created_at', { ascending: false }),
    supabase.from('student_task_completions').select('publication_id, completed_at'),
    // RLS scopes these to the caller's own submissions, so no student filter.
    supabase.from('homework_submissions').select('publication_id'),
  ])

  const completedAt = new Map((done.data ?? []).map((c) => [c.publication_id, c.completed_at]))
  const handedIn = new Set((submitted.data ?? []).map((s) => s.publication_id))
  return (tasks.data ?? []).map((t) => ({
    ...t,
    completed_at: completedAt.get(t.id) ?? null,
    submitted: handedIn.has(t.id),
  })) as StudentTask[]
}
