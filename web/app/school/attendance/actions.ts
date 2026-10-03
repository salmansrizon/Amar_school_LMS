'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PAGE = '/school/attendance'

// Per-school manual-attendance override switch (issue #30, PRD §5.3: preserve
// the legacy "de-activate automatic attendance" toggle). Switching off stops
// reconcile_attendance from touching this School's raw taps (migration
// 0047); the school then relies fully on save_student_attendance-style
// manual marking. RPC does its own role check same as set_school_default_grace.
export async function setAutomaticAttendance(enabled: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_automatic_attendance_enabled', { enabled })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
