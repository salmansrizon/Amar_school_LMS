import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getRoleContext, type RoleContext } from '@/lib/auth/role-context'

// The /student/* guard (#441) — the shared single-role gate pinned to 'student',
// plus the one fact every student page needs: which Student row this login is.
//
// student_self is a definer view over `students` filtered to auth.uid(); a
// Student has no SELECT policy on `students` itself, so this is the only way in
// and the sensitive admission columns are absent rather than merely unselected.
export interface StudentContext extends RoleContext {
  student: StudentSelf
}

export interface StudentSelf {
  id: string
  school_id: string
  student_no: string | null
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
  photo_path: string | null
}

const SELF_COLUMNS = 'id, school_id, student_no, full_name, roll_number, class_name, section, photo_path'

export const getStudentContext = cache(async (): Promise<StudentContext> => {
  const ctx = await getRoleContext('student')
  const { data } = await ctx.supabase.from('student_self').select(SELF_COLUMNS).maybeSingle()

  // No live Student row — archived (student_self filters those out), or
  // unlinked by an owner. There is nothing in the portal for them; the
  // account-blocked page is the existing "access switched off" surface (#161).
  if (!data) redirect('/account-blocked')

  return { ...ctx, student: data as StudentSelf }
})
