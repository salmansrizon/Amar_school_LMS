import type { SupabaseClient } from '@supabase/supabase-js'
import { smsGateway } from '@/lib/sms/gateway'

// One place that sends an SMS about a Student to their guardian and records it
// in the Send Log. Behaviour notes (#46) and login hand-over (#442) had the same
// fetch → guard → send → log shape line for line, including the "the message is
// already gone, so a log failure must not look retryable" rule — which is
// exactly the kind of thing that drifts when it lives in two places.

export interface StudentSmsResult {
  ok: boolean
  error?: string
}

/**
 * @param storedBody What to write to sms_log when it must differ from what was
 *   sent. Credential hand-over passes a masked copy: the Send Log is readable by
 *   any staff member with the SMS screen, so the password must not land there.
 */
export async function sendStudentSms(
  supabase: SupabaseClient,
  studentId: string,
  body: string,
  storedBody: string = body,
): Promise<StudentSmsResult> {
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, guardian_phone, school_id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return { ok: false, error: 'Student not found' }
  if (!student.guardian_phone) {
    return { ok: false, error: 'No guardian phone on file for this student' }
  }

  const gateway = smsGateway()
  const result = await gateway.send(student.guardian_phone, body)
  if (!result.ok) return { ok: false, error: 'SMS gateway failed to send' }

  const { error } = await supabase.from('sms_log').insert({
    school_id: student.school_id,
    student_id: student.id,
    sent_on: new Date().toISOString().slice(0, 10),
    phone: student.guardian_phone,
    body: storedBody,
    provider: gateway.name,
    // Send Log (issue #36) groups sms_log rows by kind/recipient_label; give
    // this single-recipient send a real label instead of falling through to the
    // compose screen's "Manual Numbers" default.
    recipient_label: student.full_name,
  })
  // The SMS is already sent — a log-insert failure must not surface as a
  // retryable error, or the guardian gets a duplicate message on retry.
  if (error) console.error('sms_log insert failed after successful send', error)
  return { ok: true }
}
