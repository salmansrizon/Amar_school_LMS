import type { Tone } from '@/components/ui/page'
import { isAnswered, type MessageStatus } from '@/lib/student/messages'

// বার্তা ও অনুরোধ / Messages & Requests (#509), kept pure.
//
// Three sidebar entries merged into one section, because a Class Teacher has no
// reason to read "সংশোধনের অনুরোধ", "শিক্ষার্থীদের প্রশ্ন" and "প্রশ্নের
// উত্তরের অবস্থা" as "the students are waiting on you". What lives here is the
// arithmetic of that section — which tab, how old is old, and does the caller
// reach anything at all — so the pages stay thin and the rules stay tested.

/**
 * Hours a question may wait before the section starts saying so.
 *
 * A guess at these schools' rhythm, not a measurement — which is exactly why it
 * is named here rather than written as `24` inside a comparison. A school that
 * checks twice a week wants 72/168, and that is one edit.
 */
export const WAITING_WARN_HOURS = 24
export const WAITING_LATE_HOURS = 72

const HOUR = 1000 * 60 * 60

/** Whole hours a question has been waiting, or has waited before its reply. */
export function waitingHours(
  item: { created_at: string; replied_at?: string | null },
  now: Date = new Date(),
): number {
  const end = item.replied_at ? new Date(item.replied_at).getTime() : now.getTime()
  return Math.max(0, Math.floor((end - new Date(item.created_at).getTime()) / HOUR))
}

/**
 * The status rail for one queue item — `components/ui/page.tsx` calls the rail
 * "the one place this design spends boldness", so ageing gets no new component.
 *
 * Counted on UNANSWERED items only: an answered question is done, however long
 * it took, and colouring history red just makes the page shout at a teacher who
 * has already dealt with it.
 *
 *   answered      → mint    (settled)
 *   waiting < 24h → none    (fresh; a rail on everything is a rail on nothing)
 *   waiting > 24h → sun
 *   waiting > 72h → alert
 */
export function waitingTone(
  item: { created_at: string; replied_at?: string | null; status?: string },
  now: Date = new Date(),
): Tone | undefined {
  // Questions go through isAnswered — the one definition (see messages.ts).
  // 'applied'/'rejected' are the Correction Request's own settled states, which
  // have no equivalent there because a correction is not a Question.
  const settled =
    isAnswered({ status: (item.status ?? 'unread') as MessageStatus, replied_at: item.replied_at ?? null }) ||
    item.status === 'applied' ||
    item.status === 'rejected'
  if (settled) return 'mint'
  const hours = waitingHours(item, now)
  if (hours >= WAITING_LATE_HOURS) return 'alert'
  if (hours >= WAITING_WARN_HOURS) return 'sun'
  return undefined
}

export type HubTabKey = 'questions' | 'corrections' | 'response'

export interface HubTab {
  key: HubTabKey
  href: string
  /** Only the two queues carry a count; the retrospective view has nothing
   *  waiting on anybody. */
  countable: boolean
}

/**
 * Queues first, retrospective view last — and the routes do NOT move.
 *
 * Consolidating all three under one path segment looked tidier and was
 * rejected: `proxy.ts` gates on the first path segment only, so `/school/feedback/*`
 * would demand the `feedback` grant for every tab, and teaching `screenKeyForPath`
 * a prefix table plus a class-teacher lookup in edge middleware buys a cosmetic
 * URL for a per-request query. The tab bar spans three trees; that is fine.
 */
export const HUB_TABS: readonly HubTab[] = [
  { key: 'questions', href: '/school/questions', countable: true },
  { key: 'corrections', href: '/school/corrections', countable: true },
  { key: 'response', href: '/school/questions/response', countable: false },
]

/** The section's own entry point, for the sidebar and for search. */
export const HUB_HOME = '/school/questions'

/**
 * Whether to show a badge at all.
 *
 * Zero disappears rather than rendering `0`: a badge that is permanently there
 * showing nothing is a badge people stop seeing, and this one has to survive
 * being right about a backlog months from now.
 */
export function badgeCount(count: number | null | undefined): number | null {
  return count && count > 0 ? count : null
}
