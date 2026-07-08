// Reconciliation rules (issue #10) — TS mirror of reconcile_attendance
// (migration 0017) for UI/preview; SQL is the authority.

export interface CollapsedTaps {
  entry: Date
  exit: Date | null
}

/** Earliest tap = entry, latest = exit, taps in between are noise. */
export function collapseTaps(taps: Date[]): CollapsedTaps | null {
  if (taps.length === 0) return null
  const sorted = [...taps].sort((a, b) => a.getTime() - b.getTime())
  const entry = sorted[0]
  const exit = sorted.length > 1 ? sorted[sorted.length - 1] : null
  return { entry, exit }
}

export type AttendanceStatus = 'present' | 'on_time' | 'late_entry' | 'exit_early' | 'late_exit_early'

/**
 * Legacy status matrix: late-entry × early-exit, with the Considerable Grace
 * Window applied to the entry side. Times are 'HH:MM' interpreted as UTC —
 * matching the SQL job. Devices must send UTC timestamps.
 * ponytail: single-timezone assumption; add schools.timezone when a non-UTC
 * deployment needs local-time statuses.
 */
export function employeeStatus(
  entry: Date,
  exit: Date | null,
  shiftStart: string | null,
  shiftEnd: string | null,
  graceMinutes: number,
): AttendanceStatus {
  if (!shiftStart || !shiftEnd) return 'present'

  const dayStart = new Date(entry)
  const [startHours, startMinutes] = shiftStart.split(':').map(Number)
  dayStart.setUTCHours(startHours, startMinutes, 0, 0)
  const latestOnTime = dayStart.getTime() + graceMinutes * 60_000

  const dayEnd = new Date(entry)
  const [endHours, endMinutes] = shiftEnd.split(':').map(Number)
  dayEnd.setUTCHours(endHours, endMinutes, 0, 0)

  const late = entry.getTime() > latestOnTime
  const early = exit !== null && exit.getTime() < dayEnd.getTime()

  if (late && early) return 'late_exit_early'
  if (late) return 'late_entry'
  if (early) return 'exit_early'
  return 'on_time'
}
