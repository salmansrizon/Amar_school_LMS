import { t, type Lang } from '@/lib/i18n'

/** Render a stored `students.guardian_relation` in the caller's language.
 *
 *  The column holds the vocabulary the admission form writes — `father`,
 *  `mother`, `other` — but it is free text, not a database enum, and staging holds
 *  both `father` and `Father`. So matching is case-insensitive and trimmed.
 *
 *  This exists because the same three values were rendered three different ways:
 *  translated by an inline ternary on the owner's student detail, and raw on the
 *  student's own profile and the printed admission form. A Bangla-speaking child
 *  read `father` in the middle of a Bangla page, and a school printed it onto an
 *  official document (#539).
 *
 *  Unknown values pass through unchanged rather than being blanked or guessed:
 *  the column is free text, so a school that typed something else should still see
 *  what it typed. */
export function guardianRelationLabel(value: string | null | undefined, lang: Lang): string | null {
  if (!value) return null
  switch (value.trim().toLowerCase()) {
    case 'father':
      return t('students.father', lang)
    case 'mother':
      return t('students.mother', lang)
    case 'other':
      return t('students.otherRelation', lang)
    default:
      return value
  }
}
