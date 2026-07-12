'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'
import { countSmsSegments } from '@/lib/sms/segments'
import {
  resolveRecipients,
  type ComposeMode,
  type ComposeStudentRow,
  type ComposeEmployeeRow,
} from '@/lib/sms/recipients'

const PAGE = '/school/sms/rules'
const LOG_PAGE = '/school/sms/log'

export async function addOffDay(formData: FormData): Promise<{ error?: string }> {
  const day = formData.get('day') as string
  const label = (formData.get('label') as string) || null
  if (!day) return { error: 'Day is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('off_days').insert({ day, label })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function deleteOffDay(formData: FormData): Promise<{ error?: string }> {
  const day = formData.get('day') as string
  if (!day) return { error: 'Day is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('off_days').delete().eq('day', day)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function addRule(formData: FormData): Promise<{ error?: string }> {
  const ruleType = formData.get('rule-type') as string
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  if (ruleType === 'exact') {
    const exactDays = parseInt(formData.get('exact_days') as string)
    if (isNaN(exactDays) || exactDays < 1) return { error: 'Invalid exact days' }
    const { error } = await supabase.from('absence_sms_rules').insert({ exact_days: exactDays })
    if (error) return { error: error.message }
  } else if (ruleType === 'range') {
    const rangeFrom = parseInt(formData.get('range_from') as string)
    const rangeTo = parseInt(formData.get('range_to') as string)
    if (isNaN(rangeFrom) || isNaN(rangeTo) || rangeFrom < 1 || rangeTo < rangeFrom) {
      return { error: 'Invalid range' }
    }
    const { error } = await supabase.from('absence_sms_rules').insert({ range_from: rangeFrom, range_to: rangeTo })
    if (error) return { error: error.message }
  } else {
    return { error: 'Invalid rule type' }
  }

  revalidatePath(PAGE)
  return {}
}

export async function deleteRule(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get('id') as string
  if (!id) return { error: 'Rule ID is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('absence_sms_rules').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function addLeave(formData: FormData): Promise<{ error?: string }> {
  const studentId = formData.get('student_id') as string
  const fromDay = formData.get('from_day') as string
  const toDay = formData.get('to_day') as string
  if (!studentId || !fromDay || !toDay) return { error: 'Student, from, and to are required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('student_leaves').insert({ student_id: studentId, from_day: fromDay, to_day: toDay })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function deleteLeave(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get('id') as string
  if (!id) return { error: 'Leave ID is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('student_leaves').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

// Compose/send (issue #36, PRD §5.7). Recipients are resolved with the same
// pure functions the client uses for the "estimated recipients" preview
// (lib/sms/recipients), then sent through the shared SmsGateway (lib/sms/gateway
// — the same one the absence-rule cron uses) and logged to sms_log with
// kind='manual' so the Send Log totals combine both sources.
export async function sendCompose(formData: FormData): Promise<{ error?: string; sent?: number; failed?: number }> {
  const mode = formData.get('mode') as ComposeMode
  const body = ((formData.get('body') as string) || '').trim()
  const className = (formData.get('class_name') as string) || ''
  const shiftId = (formData.get('shift_id') as string) || ''
  const section = (formData.get('section') as string) || ''
  const category = (formData.get('category') as string) || ''
  const manualNumbers = (formData.get('manual_numbers') as string) || ''

  if (!body) return { error: 'Message is required' }
  if (mode !== 'class_shift_section' && mode !== 'group' && mode !== 'manual') {
    return { error: 'Invalid recipient mode' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { data: me } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') return { error: 'Unauthorized' }
  if (!me.school_id) return { error: 'Unauthorized' }

  const [{ data: students }, { data: employees }] = await Promise.all([
    supabase.from('students').select('id, full_name, class_name, section, shift_id, guardian_phone'),
    supabase.from('employees').select('id, full_name, category, mobile'),
  ])

  const recipients = resolveRecipients(mode, {
    students: (students ?? []) as ComposeStudentRow[],
    employees: (employees ?? []) as ComposeEmployeeRow[],
    filter: { className, shiftId, section },
    category,
    manualNumbers,
  })
  if (recipients.length === 0) return { error: 'No recipients found' }

  const recipientLabel =
    mode === 'class_shift_section'
      ? [className, section].filter(Boolean).join(' / ') || null
      : mode === 'group'
        ? category || null
        : null

  const segments = countSmsSegments(body).segments || 1
  const gateway = smsGateway()
  const batchId = crypto.randomUUID()
  const sentOn = new Date().toISOString().slice(0, 10)

  const results = await Promise.all(
    recipients.map(async (r) => {
      try {
        const result = await gateway.send(r.phone, body)
        return { r, ok: result.ok }
      } catch {
        return { r, ok: false }
      }
    }),
  )

  const rows = results.map(({ r, ok }) => ({
    school_id: me.school_id,
    student_id: r.studentId ?? null,
    rule_id: null,
    sent_on: sentOn,
    phone: r.phone,
    body,
    provider: gateway.name,
    kind: 'manual' as const,
    status: ok ? ('sent' as const) : ('failed' as const),
    batch_id: batchId,
    recipient_label: recipientLabel,
    segments,
  }))

  const { error } = await supabase.from('sms_log').insert(rows)
  if (error) return { error: error.message }

  revalidatePath(LOG_PAGE)
  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent
  return { sent, failed }
}