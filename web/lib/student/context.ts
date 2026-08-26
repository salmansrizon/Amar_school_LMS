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
  /** trial | active | expired, computed on read by school_subscription_status.
   *  Expired makes the portal read-only rather than dark (CONTEXT.md, Student):
   *  expiry is a renewal prompt aimed at whoever can pay, and a child cannot. */
  subscriptionStatus: string | null
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
  // unlinked by an owner. Their school is healthy, so this is not the #161
  // suspension: same page, its "account inactive" wording.
  if (!data) redirect('/account-blocked?reason=student-inactive')

  const student = data as StudentSelf
  const { data: status } = await ctx.supabase.rpc('school_subscription_status', {
    sid: student.school_id,
  })

  return { ...ctx, student, subscriptionStatus: (status as string | null) ?? null }
})

/** True when the School's subscription has lapsed. Every Student write must
 *  check this; reads are deliberately unaffected. */
export function isReadOnly(ctx: StudentContext): boolean {
  return ctx.subscriptionStatus === 'expired'
}
