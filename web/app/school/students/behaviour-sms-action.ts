'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'

/**
 * Send an SMS about a behaviour record to the student's guardian (issue #46).
 * Uses the provider-agnostic gateway (LogSmsProvider until MIMSMS is configured)
 * and records the send in sms_log, mirroring the automated absence-SMS path.
 */
export async function sendBehaviourSms(entryId: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }

  const { data: entry } = await supabase
    .from('behaviour_log_entries')
    .select('note, student_id')
    .eq('id', entryId)
    .maybeSingle()
  if (!entry) return { error: 'Entry not found or not accessible' }

  const { data: student } = await supabase
    .from('students')
    .select('full_name, guardian_mobile, student_mobile')
    .eq('id', entry.student_id)
    .maybeSingle()
  if (!student) return { error: 'Student not found' }

  const phone = student.guardian_mobile ?? student.student_mobile
  if (!phone) return { error: 'No guardian or student mobile number on file' }

  const body = `${student.full_name}: ${entry.note}`.slice(0, 300)
  const result = await smsGateway().send(phone, body)

  const { error: logErr } = await supabase.from('sms_log').insert({
    school_id: profile.school_id,
    student_id: entry.student_id,
    sent_on: new Date().toISOString().slice(0, 10),
    phone,
    body,
    provider: result.provider,
  })
  if (logErr) return { error: logErr.message }

  revalidatePath(`/school/students/${entry.student_id}`)
  return { ok: result.ok }
}
