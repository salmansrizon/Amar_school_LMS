'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember, requireSchoolMemberProfile } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { smsGateway } from '@/lib/sms/gateway'
import { countSmsSegments } from '@/lib/sms/segments'
import { smsCanSend, smsPoolBalance, smsRecordDebit } from '@/lib/sms/credit'
import {
  classTargetFromInput,
  formatClassTargetLabel,
  resolveRecipients,
  COMPOSE_STUDENT_COLUMNS,
  COMPOSE_EMPLOYEE_COLUMNS,
  type ComposeMode,
  type ComposeStudentRow,
  type ComposeEmployeeRow,
} from '@/lib/sms/recipients'
import type { TargetScope } from '@/lib/publishing'

const RULES_PAGE = '/school/sms/rules'
const LOG_PAGE = '/school/sms/log'

export async function addOffDay(formData: FormData): Promise<{ error?: string }> {
  const day = formData.get('day') as string
  const label = (formData.get('label') as string) || null
  if (!day) return { error: 'Day is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('off_days').insert({ day, label })
  if (error) return { error: error.message }
  revalidatePath(RULES_PAGE)
  return {}
}

export async function deleteOffDay(formData: FormData): Promise<{ error?: string }> {
  const day = formData.get('day') as string
  if (!day) return { error: 'Day is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('off_days').delete().eq('day', day)
  if (error) return { error: error.message }
  revalidatePath(RULES_PAGE)
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

  revalidatePath(RULES_PAGE)
  return {}
}

export async function deleteRule(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get('id') as string
  if (!id) return { error: 'Rule ID is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('absence_sms_rules').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(RULES_PAGE)
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
  revalidatePath(RULES_PAGE)
  return {}
}

export async function deleteLeave(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get('id') as string
  if (!id) return { error: 'Leave ID is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('student_leaves').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(RULES_PAGE)
  return {}
}

// Compose/send (issue #36, PRD §5.7). Recipients are resolved with the same
// pure functions the client uses for the "estimated recipients" preview
// (lib/sms/recipients), then sent through the shared SmsGateway (lib/sms/gateway
// — the same one the absence-rule cron uses) and logged to sms_log with
// kind='manual' so the Send Log totals combine both sources.
export async function sendCompose(formData: FormData): Promise<{ error?: string; sent?: number; failed?: number }> {
  const lang = await currentLang()
  const mode = formData.get('mode') as ComposeMode
  const body = ((formData.get('body') as string) || '').trim()
  const targetScope = (formData.get('target_scope') as string) || 'all'
  const offeringId = (formData.get('offering_id') as string) || ''
  const targetClassName = (formData.get('target_class_name') as string) || ''
  const targetShift = (formData.get('target_shift') as string) || ''
  const targetGroupDepartment = (formData.get('target_group_department') as string) || ''
  const targetSection = (formData.get('target_section') as string) || ''
  const category = (formData.get('category') as string) || ''
  const manualNumbers = (formData.get('manual_numbers') as string) || ''

  if (!body) return { error: t('sms.messageRequired', lang) }
  if (mode !== 'class_section' && mode !== 'group' && mode !== 'manual') {
    return { error: t('sms.invalidMode', lang) }
  }
  if (targetScope !== 'all' && targetScope !== 'offering' && targetScope !== 'broadcast') {
    return { error: t('sms.invalidTarget', lang) }
  }
  // Each non-'all' scope has one required field. Without this, a broadcast
  // left on "All Classes" or an offering with nothing picked maps to a
  // className/id of null, which the shared predicate never matches — the send
  // would fail as "no recipients" with no hint that the target was incomplete.
  if (mode === 'class_section' && targetScope === 'offering' && !offeringId) {
    return { error: t('sms.invalidTarget', lang) }
  }
  if (mode === 'class_section' && targetScope === 'broadcast' && !targetClassName) {
    return { error: t('sms.invalidTarget', lang) }
  }

  const supabase = await createClient()
  const { ok, schoolId } = await requireSchoolMemberProfile(supabase)
  if (!ok || !schoolId) return { error: 'Unauthorized' }

  const needsOfferings = mode === 'class_section' && targetScope === 'offering'

  // Withdrawn/archived students and employees are excluded — matches the
  // active-only default every other list screen in this app uses. The
  // School's active Academic Year pins a broadcast target's Year (#599). The
  // Offerings list is fetched only for an 'offering'-scope send — its sole
  // use is the Send Log label lookup below.
  const [{ data: students }, { data: employees }, { data: school }, { data: offerings }] = await Promise.all([
    supabase.from('students').select(COMPOSE_STUDENT_COLUMNS).is('archived_at', null),
    supabase.from('employee_card').select(COMPOSE_EMPLOYEE_COLUMNS).is('archived_at', null),
    supabase.from('schools').select('active_academic_year').eq('id', schoolId).maybeSingle(),
    needsOfferings
      ? supabase.from('class_offerings').select('id, name, section, group_department, shift')
      : Promise.resolve({ data: [] as { id: string; name: string; section: string | null; group_department: string | null; shift: string | null }[] }),
  ])

  const activeAcademicYear = school?.active_academic_year ?? null
  // A broadcast target is always pinned to a real Year (#599) — the shared
  // predicate has no "Any year" and class_offerings.academic_year is NOT NULL,
  // so a null pin can only ever match nobody. Fail loudly instead.
  if (mode === 'class_section' && targetScope === 'broadcast' && activeAcademicYear === null) {
    return { error: t('sms.noActiveYear', lang) }
  }

  // The exact same predicate input the client built for its live "estimated
  // recipients" preview — one resolution function, not two (issue #606
  // acceptance criterion).
  const target = classTargetFromInput(
    {
      scope: targetScope as TargetScope,
      offeringId,
      className: targetClassName,
      shift: targetShift,
      groupDepartment: targetGroupDepartment,
      section: targetSection,
    },
    activeAcademicYear,
  )

  const recipients = resolveRecipients(mode, {
    students: (students ?? []) as unknown as ComposeStudentRow[],
    employees: (employees ?? []) as ComposeEmployeeRow[],
    target,
    category,
    manualNumbers,
  })
  if (recipients.length === 0) return { error: t('sms.noRecipients', lang) }

  const recipientLabel =
    mode === 'class_section'
      ? formatClassTargetLabel(target, (offerings ?? []).find((o) => o.id === offeringId) ?? null)
      : mode === 'group'
        ? category || null
        : null

  const segments = countSmsSegments(body).segments || 1

  // Prepaid metering (map #171 T6): the DB is the authority. When enforcement is
  // on for this school and the balance can't cover the whole batch, deny before
  // sending; the successful segments are debited afterwards. Enforcement is
  // off by default, so unmetered schools send exactly as before.
  const needed = recipients.length * segments
  if (!(await smsCanSend(supabase, schoolId, needed))) {
    // Two failures, one boolean (#529). Ask which one before blaming the school:
    // an owner with credit to spare must not be sent to a top-up screen that
    // cannot help her.
    const poolShort = (await smsPoolBalance(supabase)) < needed
    return { error: t(poolShort ? 'sms.poolExhausted' : 'sms.creditExhausted', lang) }
  }

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
    school_id: schoolId,
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

  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent
  // Debit only the segments that actually went out.
  await smsRecordDebit(supabase, schoolId, sent * segments)

  revalidatePath(LOG_PAGE)
  return { sent, failed }
}