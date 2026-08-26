'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { requireSchoolOwnerProfile } from '@/lib/auth/require-role'
import { rejectCorrection } from '@/lib/student/corrections'

// Correction requests (#456). The Student asks; the Owner applies.

/** Raise a request. `current_value` is captured from the Student's own view of
 *  their record, so the Owner sees what the Student was looking at when they
 *  asked — not what it happens to say by the time the queue is read. */
export async function requestCorrection(formData: FormData): Promise<{ error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const field = String(formData.get('field') ?? '')
  const requestedValue = String(formData.get('requested_value') ?? '')
  const currentValue = String(formData.get('current_value') ?? '') || null

  const rejected = rejectCorrection({ field, requestedValue, currentValue })
  if (rejected) return { error: rejected }

  const supabase = await createClient()
  const { error } = await supabase.from('student_profile_change_requests').insert({
    school_id: ctx.student.school_id,
    student_id: ctx.student.id,
    field,
    current_value: currentValue,
    requested_value: requestedValue.trim(),
    note: String(formData.get('note') ?? '').trim() || null,
  })
  if (error) return { error: error.message }

  revalidatePath('/student/profile')
  return {}
}

/** A pending photo, uploaded to the student's own pending folder. The path is
 *  derived server-side: the storage policy keys on those folders, so a
 *  client-chosen path would be the whole hole. */
export async function pendingPhotoPath(
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  const ctx = await getStudentContext()
  if (isReadOnly(ctx)) return { error: 'readOnly' }

  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType]
  if (!ext) return { error: 'type' }

  return {
    path: `${ctx.student.school_id}/pending/${ctx.student.id}/${crypto.randomUUID()}.${ext}`,
  }
}

/** Applying goes through the RPC, never a raw update: the write to `students`
 *  and the resolution of the request must not be able to come apart, and the
 *  whitelist is re-checked where the pen actually is. */
export async function applyCorrection(requestId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { ok } = await requireSchoolOwnerProfile(supabase)
  if (!ok) return { error: 'Unauthorized' }

  const { error } = await supabase.rpc('apply_profile_change_request', { p_request: requestId })
  if (error) return { error: error.message }

  revalidatePath('/school/corrections')
  return {}
}

/** Rejecting carries a reason, because "no" without one is not an answer the
 *  Student can act on. */
export async function rejectCorrectionRequest(
  requestId: string,
  reason: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { ok } = await requireSchoolOwnerProfile(supabase)
  if (!ok) return { error: 'Unauthorized' }
  if (!reason.trim()) return { error: 'A reason is required' }

  const { data, error } = await supabase
    .from('student_profile_change_requests')
    .update({
      status: 'rejected',
      reject_reason: reason.trim(),
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'This request has already been resolved' }

  revalidatePath('/school/corrections')
  return {}
}
