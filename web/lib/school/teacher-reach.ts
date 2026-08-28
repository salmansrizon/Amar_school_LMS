import { t, type Lang } from '@/lib/i18n'

export interface TeacherReach {
  /** Classes this teacher is class teacher of. */
  classTeacherOf: string[]
  /** Classes they appear in the routine for. */
  teaches: string[]
}

/** Plain sentences describing exactly what a teacher will be able to reach.
 *
 *  ADR 0021 makes a Class Teacher's reach follow from the assignment rather than
 *  from a Permission Grant, so "what will this person see" is derivable and does
 *  not need an Owner to reason about checkboxes. Showing it before confirming is
 *  the ticket's requirement (#533) — an Owner should not have to discover the
 *  answer by logging in as the teacher.
 *
 *  Returns sentences rather than a component so the wording is testable and the
 *  same text can appear on a confirmation, a summary card, or a printed handover. */
export function reachSentences(reach: TeacherReach, lang: Lang): string[] {
  const out: string[] = []

  if (reach.classTeacherOf.length) {
    out.push(
      `${t('teacher.reachClassTeacher', lang)}: ${reach.classTeacherOf.join(', ')}`,
      t('teacher.reachClassTeacherDetail', lang),
    )
  }

  if (reach.teaches.length) {
    out.push(
      `${t('teacher.reachSubjectTeacher', lang)}: ${reach.teaches.join(', ')}`,
      t('teacher.reachSubjectTeacherDetail', lang),
    )
  }

  // The case the UAT pass actually hit: an Employee created, never assigned, and
  // therefore able to log in and see nothing. Saying so at creation time is the
  // difference between a known next step and a teacher reporting a broken portal.
  if (!out.length) out.push(t('teacher.reachNone', lang))

  // True regardless of assignment, and worth stating because it is the half an
  // Owner is most likely to assume wrongly.
  out.push(t('teacher.reachNever', lang))
  return out
}
