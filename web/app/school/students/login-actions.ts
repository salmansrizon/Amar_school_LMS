'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'
import { PASSWORD_MASK, studentLoginSmsBody } from '@/lib/students'

// Student login provisioning, owner side (#442). Every check that matters lives
// in the create_student_login / set_student_password RPCs (owner-only, own
// school only, audited) — these actions are the thin call layer plus the SMS
// hand-over. A password is returned to the caller exactly once, for the printed
// slip, and is never written anywhere in plaintext.

const LIST = '/school/students'

/** ponytail: 12 hex chars (~48 bits) off crypto.randomUUID. It is a
 *  hand-delivered first password, not a long-lived secret — the owner can reset
 *  it, and a Student has no self-service reset (their address has no inbox). */
function newPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export interface IssuedLogin {
  studentId: string
  fullName: string
  studentNo: string | null
  email: string
  password: string
}

export interface BulkResult {
  issued: IssuedLogin[]
  failed: { fullName: string; error: string }[]
  error?: string
}

/** One Student, one new login. Returns the credentials once. */
export async function createStudentLogin(
  studentId: string,
  sendSms = false,
): Promise<{ login?: IssuedLogin; error?: string }> {
  const supabase = await createClient()
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, student_no')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return { error: 'Student not found' }

  const password = newPassword()
  const { data: email, error } = await supabase.rpc('create_student_login', {
    p_student_id: studentId,
    p_password: password,
  })
  if (error) return { error: error.message }

  const login: IssuedLogin = {
    studentId,
    fullName: student.full_name,
    studentNo: student.student_no,
    email: email as string,
    password,
  }
  if (sendSms) await sendLoginSms(login)

  revalidatePath(`${LIST}/${studentId}`)
  return { login }
}

/** A fresh password for an existing login. Every live session is destroyed by
 *  the RPC, so a reset actually locks the old holder out. */
export async function resetStudentPassword(
  studentId: string,
  sendSms = false,
): Promise<{ login?: IssuedLogin; error?: string }> {
  const supabase = await createClient()
  const { data: info } = await supabase
    .from('student_login_info')
    .select('student_no, full_name, email')
    .eq('student_id', studentId)
    .maybeSingle()
  if (!info) return { error: 'This student has no login' }

  const password = newPassword()
  const { error } = await supabase.rpc('set_student_password', {
    p_student_id: studentId,
    p_password: password,
  })
  if (error) return { error: error.message }

  const login: IssuedLogin = {
    studentId,
    fullName: info.full_name,
    studentNo: info.student_no,
    email: info.email,
    password,
  }
  if (sendSms) await sendLoginSms(login)

  revalidatePath(`${LIST}/${studentId}`)
  return { login }
}

/** Students of one class that would get a login — the preview the owner sees
 *  before committing. Already-provisioned and archived Students are excluded,
 *  which is also exactly what createClassLogins acts on. */
export async function classLoginCandidates(
  className: string,
  section: string,
): Promise<{ students: { id: string; full_name: string; student_no: string | null; roll_number: number | null }[]; error?: string }> {
  const supabase = await createClient()
  let query = supabase
    .from('students')
    .select('id, full_name, student_no, roll_number')
    .eq('class_name', className)
    .is('archived_at', null)
    .is('profile_id', null)
    .order('roll_number', { ascending: true, nullsFirst: false })
  query = section ? query.eq('section', section) : query.is('section', null)

  const { data, error } = await query
  if (error) return { students: [], error: error.message }
  return { students: data ?? [] }
}

/** A whole class at once. Per-Student, not one transaction: a Student who
 *  cannot be provisioned (no Student Number, address already taken) must not
 *  cost the other 39 their logins. Re-running fills only the gaps. */
export async function createClassLogins(
  className: string,
  section: string,
  sendSms = false,
): Promise<BulkResult> {
  const { students, error } = await classLoginCandidates(className, section)
  if (error) return { issued: [], failed: [], error }

  const issued: IssuedLogin[] = []
  const failed: { fullName: string; error: string }[] = []
  for (const student of students) {
    const result = await createStudentLogin(student.id, sendSms)
    if (result.login) issued.push(result.login)
    else failed.push({ fullName: student.full_name, error: result.error ?? 'Unknown error' })
  }

  revalidatePath(LIST)
  return { issued, failed }
}

/** Hand the credentials to the guardian by SMS. A send failure is reported but
 *  never fails the provisioning — the login exists either way, and the owner
 *  still has the printable slip. */
async function sendLoginSms(login: IssuedLogin): Promise<void> {
  const supabase = await createClient()
  const { data: student } = await supabase
    .from('students')
    .select('id, school_id, guardian_phone')
    .eq('id', login.studentId)
    .maybeSingle()
  if (!student?.guardian_phone) return

  const body = studentLoginSmsBody(login.fullName, login.email, login.password)
  const gateway = smsGateway()
  const result = await gateway.send(student.guardian_phone, body)
  if (!result.ok) return

  const { error } = await supabase.from('sms_log').insert({
    school_id: student.school_id,
    student_id: student.id,
    sent_on: new Date().toISOString().slice(0, 10),
    phone: student.guardian_phone,
    // The Send Log is readable by every staff member with the SMS screen, so
    // the stored copy carries the mask, not the password. The password is
    // plaintext in exactly one place: the message already on its way out.
    body: studentLoginSmsBody(login.fullName, login.email, PASSWORD_MASK),
    provider: gateway.name,
    recipient_label: login.fullName,
  })
  if (error) console.error('sms_log insert failed after successful send', error)
}
