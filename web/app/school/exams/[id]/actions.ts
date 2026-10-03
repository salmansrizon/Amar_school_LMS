'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMemberProfile } from '@/lib/auth/require-role'
import { recordAudit } from '@/lib/engines/audit/engine'
import { publishBlock, type PublishBlock } from '@/lib/exam-setup'
import { loadExamReadiness } from '@/lib/exam-readiness'

// RLS scopes every write to the caller's School; exam_refs_same_school and the
// per-child same-school + closed-exam guard triggers (0039 migration) are the
// authority on tenancy and on rejecting edits to a Closed exam (issue #8).

function pagePath(id: string): string {
  return `/school/exams/${id}`
}

function optId(v: FormDataEntryValue | null | undefined): string | null {
  const s = String(v ?? '').trim()
  return s.length ? s : null
}

export async function updateExamBasicInfo(examId: string, formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const year = Number(formData.get('exam_year'))
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'Invalid year' }
  const classId = optId(formData.get('class_id'))
  const startDate = optId(formData.get('start_date'))

  const supabase = await createClient()
  const { error } = await supabase
    .from('exams')
    .update({ name, exam_year: year, class_id: classId, start_date: startDate })
    .eq('id', examId)
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

export async function setExamGradingScheme(examId: string, schemeId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('exams')
    .update({ grading_scheme_id: schemeId })
    .eq('id', examId)
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

export async function assignSubjectTeacher(
  examId: string,
  subjectId: string,
  teacherId: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('exam_subject_teachers')
    .upsert(
      { exam_id: examId, subject_id: subjectId, teacher_id: teacherId },
      { onConflict: 'exam_id,subject_id' },
    )
  if (error) return { error: error.message }
  revalidatePath(pagePath(examId))
  return {}
}

/** Publish or unpublish an exam's results (#440, #449).
 *
 *  Unlike Closing — which is one-way and freezes the record — publishing
 *  controls an audience and is reversible on purpose: a school that spots a
 *  marking error after publishing must be able to pull results back. Gated on
 *  ordinary Exams-screen access, the same as Closing, and audited both ways.
 *
 *  Publishing is refused while the exam cannot produce a result at all — no
 *  class, no grading scheme, or a scheme with no grade bands (`blocked` names
 *  which, for the dialog to translate). Checked here and not only in the
 *  dialog, because the dialog's counts are as old as the page. Incomplete
 *  marks do not block: the dialog warns, the owner decides. Unpublishing is
 *  never blocked. */
export async function setResultsPublished(
  examId: string,
  published: boolean,
): Promise<{ error?: string; blocked?: PublishBlock }> {
  const supabase = await createClient()
  const { ok, schoolId } = await requireSchoolMemberProfile(supabase)
  if (!ok) return { error: 'Unauthorized' }

  if (published) {
    const { data: exam } = await supabase
      .from('exams')
      .select('id, class_id, grading_scheme_id')
      .eq('id', examId)
      .maybeSingle()
    if (!exam) return { error: 'Exam not found' }
    const blocked = publishBlock(await loadExamReadiness(supabase, exam))
    if (blocked) return { error: 'Not ready to publish', blocked }
  }

  const { data, error } = await supabase
    .from('exams')
    .update({ results_published_at: published ? new Date().toISOString() : null })
    .eq('id', examId)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Exam not found' }

  await recordAudit(
    supabase,
    {
      entityType: 'exam_results',
      entityId: examId,
      action: 'update',
      schoolId,
      actorId: null,
      before: null,
      after: { published },
      ip: null,
      requestId: null,
    },
  ).catch(() => {
    // The publish already happened; an audit failure must not undo it or look
    // to the owner like the publish failed.
  })

  revalidatePath(`/school/exams/${examId}`)
  return {}
}
