'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

const PAGE = '/school/sms'

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