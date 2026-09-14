// Unsaved New Student Admission draft (issue #628) — same localStorage-draft
// shape as SMS Compose's own draft (web/app/school/sms/compose-form.tsx), but
// scoped per school + user so two Staff Users on one shared browser never see
// each other's half-finished admission. Versioned key: bump when the field
// shape changes, same reasoning as Compose's own DRAFT_KEY comment.
const DRAFT_VERSION = 'v1'

export function admissionDraftKey(schoolId: string, userId: string): string {
  return `asm-admission-draft-${DRAFT_VERSION}-${schoolId}-${userId}`
}

/** Every non-file field of the form, as a plain string map. The photo picker
 *  (a File input) is deliberately excluded: a File can't survive JSON/
 *  localStorage, and browsers refuse to let script set a file input's value
 *  for security reasons anyway — the operator just re-picks the photo. */
function snapshotFormFields(form: HTMLFormElement): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') fields[key] = value
  }
  return fields
}

export function saveAdmissionDraft(schoolId: string, userId: string, form: HTMLFormElement) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(admissionDraftKey(schoolId, userId), JSON.stringify(snapshotFormFields(form)))
  } catch {
    // Storage unavailable (private browsing, quota, disabled) — the draft
    // just won't survive navigation this time; nothing else depends on it.
  }
}

export function loadAdmissionDraft(schoolId: string, userId: string): Record<string, string> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(admissionDraftKey(schoolId, userId))
    return raw ? (JSON.parse(raw) as Record<string, string>) : null
  } catch {
    return null
  }
}

export function clearAdmissionDraft(schoolId: string, userId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(admissionDraftKey(schoolId, userId))
  } catch {
    // ignore — nothing to clean up if storage isn't available
  }
}
