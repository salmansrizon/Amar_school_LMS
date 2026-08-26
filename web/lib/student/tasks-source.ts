'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'

// Tasks I/O (#446). RLS on `publications` (0139) already scopes the list to
// what this Student may see; kind='homework' is the only filter here.

/** A Student ticking their own homework off, or taking the tick back. */
export async function setTaskDone(
  publicationId: string,
  done: boolean,
): Promise<{ error?: string }> {
  const ctx = await getStudentContext()

  // An Expired School goes read-only for Students (CONTEXT.md): every read
  // survives, every write stops. This is one of those writes.
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const supabase = await createClient()
  const { error } = done
    ? await supabase
        .from('student_task_completions')
        .upsert(
          { publication_id: publicationId, student_id: ctx.student.id },
          { onConflict: 'publication_id,student_id', ignoreDuplicates: true },
        )
    : await supabase
        .from('student_task_completions')
        .delete()
        .eq('publication_id', publicationId)
        .eq('student_id', ctx.student.id)

  if (error) return { error: error.message }
  revalidatePath('/student/tasks')
  revalidatePath('/student')
  return {}
}
