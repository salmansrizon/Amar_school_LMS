// Which one thing in a region pulses. A pulse means "live or needs you now";
// when several things in one view qualify, only the most urgent keeps it and
// the rest stay static. A zero count never qualifies.
export interface PulseCandidate<K extends string = string> {
  key: K
  /** Bigger is more urgent; ties go to the earlier candidate. */
  urgency: number
  /** The count or flag behind it; 0 / false never pulses. */
  active: number | boolean
}

export function pickPulse<K extends string>(candidates: readonly PulseCandidate<K>[]): K | null {
  let best: PulseCandidate<K> | null = null
  for (const c of candidates) {
    if (!c.active) continue
    if (!best || c.urgency > best.urgency) best = c
  }
  return best?.key ?? null
}
