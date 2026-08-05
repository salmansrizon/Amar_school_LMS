// Pure agreement-versioning helpers (#288). Kept framework-free + unit-tested so
// the server actions stay thin. Versions are monotonic integers (0101 schema);
// a version with any acceptance is a legal record and cannot be deleted.

/** Next version number: max existing + 1 (gap-safe), or 1 when none exist. */
export function nextAgreementVersion(existing: readonly number[]): number {
  return existing.length ? Math.max(...existing) + 1 : 1
}

/** A version may be deleted only if no distributor has accepted it. */
export function canDeleteVersion(version: number, acceptedVersions: readonly number[]): boolean {
  return !acceptedVersions.includes(version)
}

/** Highest (current) version number, or null when there are none. */
export function latestVersion(versions: readonly { version: number }[]): number | null {
  return versions.length ? Math.max(...versions.map((v) => v.version)) : null
}
