import { t, type Lang } from '@/lib/i18n'

// Some student columns hold a small vocabulary the admission form writes rather
// than the guardian's own words: `father`, `male`. They are free text, not
// database enums, so staging holds both `father` and `Father`, `male` and `Male` —
// matching is case-insensitive and trimmed.
//
// One place, because #539 was caused by there being three: an inline ternary on
// the owner's detail page, and raw output on the student's own profile and on the
// printed admission form. Adding a fourth surface should mean calling this, not
// writing a fourth ternary.

const VOCABULARIES: Record<string, Record<string, Parameters<typeof t>[0]>> = {
  guardian_relation: {
    father: 'students.father',
    mother: 'students.mother',
    other: 'students.otherRelation',
  },
  gender: {
    male: 'students.male',
    female: 'students.female',
    third_gender: 'students.thirdGender',
  },
  religion: {
    islam: 'students.islam',
    hinduism: 'students.hinduism',
    christianity: 'students.christianity',
    buddhism: 'students.buddhism',
  },
}

/** The canonical vocabulary value `field` recognizes for `value` (e.g. `male`),
 *  or null when `value` is free text the form's "Other" path captured — those
 *  must render as typed, not be forced into a bucket that isn't theirs. */
export function knownVocabularyValue(field: string, value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return VOCABULARIES[field]?.[v] ? v : null
}

/** Translate a stored value for `field`, or return it unchanged.
 *
 *  Unknown values pass through rather than being blanked or guessed: these
 *  columns are free text, so a school that typed something else should still see
 *  what it typed. A field with no vocabulary is returned as-is. */
export function storedFieldLabel(
  field: string,
  value: string | null | undefined,
  lang: Lang,
): string | null {
  if (!value) return null
  const key = VOCABULARIES[field]?.[value.trim().toLowerCase()]
  return key ? t(key, lang) : value
}

export const guardianRelationLabel = (value: string | null | undefined, lang: Lang) =>
  storedFieldLabel('guardian_relation', value, lang)

export const genderLabel = (value: string | null | undefined, lang: Lang) =>
  storedFieldLabel('gender', value, lang)

export const religionLabel = (value: string | null | undefined, lang: Lang) =>
  storedFieldLabel('religion', value, lang)
