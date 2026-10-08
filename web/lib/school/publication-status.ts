// Notice unpublish / republish (#696, migration 0252).
//
// publications.unpublished_at: null = published, a time = taken down.
// `undefined` means the column could not be read (0252 not applied yet): the
// status is then unknown, every row counts as published (which it is) and the
// pages offer no unpublish control.

export type UnpublishedAt = string | null | undefined

export function isUnpublished(unpublishedAt: UnpublishedAt): boolean {
  return typeof unpublishedAt === 'string' && unpublishedAt !== ''
}

/** Which toggle a row offers: notices only (the CHECK in 0252), and none while
 *  the column is missing. */
export function publishToggle(kind: string, unpublishedAt: UnpublishedAt): 'unpublish' | 'republish' | null {
  if (kind !== 'notice' || unpublishedAt === undefined) return null
  return isUnpublished(unpublishedAt) ? 'republish' : 'unpublish'
}
