import type { MessageKey } from '@/lib/i18n'

// Education levels a Government Official can be scoped to (ticket #164), aligned
// with schools.education_levels. One source for the checkboxes + validation.
export const EDUCATION_LEVELS = ['primary', 'secondary', 'higher_secondary'] as const
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]

export const EDUCATION_LEVEL_KEY: Record<EducationLevel, MessageKey> = {
  primary: 'sa.gov.eduPrimary',
  secondary: 'sa.gov.eduSecondary',
  higher_secondary: 'sa.gov.eduHigherSecondary',
}

/** Keep only known education levels (drop anything else a form might submit),
 *  de-duplicated in canonical order. */
export function sanitizeEducationScope(values: string[]): EducationLevel[] {
  return EDUCATION_LEVELS.filter((level) => values.includes(level))
}
