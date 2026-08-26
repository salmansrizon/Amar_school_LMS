// Homework submission rules (#448), kept pure so the caps are testable without
// a bucket.
//
// These numbers exist in exactly two places and must agree: here, and the
// bucket's own file_size_limit plus the enforce_submission_caps trigger (0142).
// A mismatch between an app cap and a bucket ceiling was a real defect found in
// review on the publishing ticket, so the app never enforces a *different*
// limit — it only refuses early, with a better message than a 413.

export const MAX_SUBMISSION_BYTES = 5 * 1024 * 1024
export const MAX_SUBMISSION_FILES = 5

const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/** The accept attribute for the file input, from the same map the server uses. */
export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED).join(',')

/** Storage extension for an accepted type; null means "not accepted". */
export function submissionExtension(mimeType: string): string | null {
  return ACCEPTED[mimeType] ?? null
}

export type SubmissionRejection = 'type' | 'size' | 'count' | null

/**
 * Why this upload would be refused, or null if it would be accepted.
 *
 * The server decides for real — this is the early, legible refusal. Order
 * matters: a 40 MB `.exe` should be told it is the wrong type rather than that
 * it is too big, because fixing the size would not help.
 */
export function rejectSubmission(
  file: { type: string; size: number },
  existingCount: number,
): SubmissionRejection {
  if (!submissionExtension(file.type)) return 'type'
  if (file.size > MAX_SUBMISSION_BYTES) return 'size'
  if (existingCount >= MAX_SUBMISSION_FILES) return 'count'
  return null
}

/** Where a student's file lives: school, then student, then task. The storage
 *  policies key on the first two folders, so the path IS the tenancy check. */
export function submissionPath(
  schoolId: string,
  studentId: string,
  publicationId: string,
  extension: string,
): string {
  return `${schoolId}/${studentId}/${publicationId}/${crypto.randomUUID()}.${extension}`
}
