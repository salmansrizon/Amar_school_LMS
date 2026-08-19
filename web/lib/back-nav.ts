// Return-origin contract (map #373).
//
// Every in-app Back control used to be a hardcoded `<Link href={parent}>` —
// the same chevron copy-pasted into 75 files, each pointing at its *structural*
// parent. That made Back unwind through screens the user never chose to visit:
// routine/print → routine → Basic Info → the exam list, scrolled to the top
// (docs/010_exam_module.md §3).
//
// The fix is to let a destination be told where it was opened from. A link that
// opens a destination appends its own address as `?from=…`; the destination
// resolves that back into a Back target, falling back to its structural parent
// when there is no origin. That fallback is what keeps every other entry point
// working — Seat Plan from seat-plan-controls, Attendance Sheet from the seat
// plan page, Promotion from Result Book — without any per-page special-casing
// (§6: "respect the actual navigation origin, rather than globally hardcoding").
//
// Deliberately not history-based: §6 forbids `history.back()` chains, and the
// print destinations open in a new tab, where there is no history to go back to.

/** The single search param that carries a return origin. */
export const ORIGIN_PARAM = 'from'

// A base that can never resolve, used only to normalize a relative path so that
// traversal and protocol-relative tricks collapse into something checkable.
const INTERNAL_BASE = 'https://internal.invalid'

/** Origins are only ever school-area pages; nothing else may be linked to. */
const ALLOWED_PREFIX = '/school/'

/**
 * The Back target for a destination page: the validated origin it was opened
 * from, or `fallback` (its structural parent) when there is none.
 *
 * `from` arrives from the URL, so it is untrusted input flowing into a link
 * target — an open-redirect vector. Anything that does not normalize to an
 * internal `/school/` path is discarded in favour of the fallback. Resolving
 * against a base URL rather than string-matching is what makes that check hold:
 * `/school/../../etc` normalizes to `/etc`, and `//evil.com` normalizes to a
 * different origin, so both are caught by the same two lines.
 *
 * The query is re-serialized rather than passed through, so a stray `%` cannot
 * survive into the href. That case is reachable from ordinary use, not just
 * abuse: searching the exam list for `50%` yields the origin
 * `/school/exams?q=50%`, on which `decodeURIComponent` throws. Rejecting it
 * would strand the user on Basic Info for a legitimate search, so it is
 * normalized to `q=50%25` instead.
 */
export function resolveBackHref(from: string | string[] | undefined, fallback: string): string {
  // Repeated params give an array — ambiguous, so it is not an origin.
  if (typeof from !== 'string' || !from.startsWith('/')) return fallback
  try {
    const url = new URL(from, INTERNAL_BASE)
    if (url.origin !== INTERNAL_BASE) return fallback
    if (!url.pathname.startsWith(ALLOWED_PREFIX)) return fallback
    const query = url.searchParams.toString()
    return `${url.pathname}${query ? `?${query}` : ''}`
  } catch {
    return fallback
  }
}

/**
 * Append a return origin to a destination href. Paired with `resolveBackHref`
 * so the encoding lives in exactly one place.
 */
export function withOrigin(href: string, origin: string): string {
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}${ORIGIN_PARAM}=${encodeURIComponent(origin)}`
}

/**
 * Whether a Back target will position its own scroll, so Next should keep its
 * hands off.
 *
 * `<Link scroll>` defaults to true, and Next then "scrolls to the top of the
 * first Page element" whenever the destination is not already in the viewport
 * (node_modules/next/dist/docs/.../link.md). Returning to the exam list is
 * exactly that case, so Next's scroll pass and the row-anchor restore both run
 * and whichever lands last wins.
 *
 * Measured: the restore currently wins anyway — the e2e passes with this
 * removed. It is kept because "wins a race" is not a property worth depending
 * on across framework versions, and losing it silently reinstates the exact bug
 * §5 exists to fix (Back dumping the user at the top of a long list). Cheap
 * determinism, not a fix for an observed failure.
 */
export function restoresOwnScroll(href: string): boolean {
  const query = href.split('?')[1]
  return query ? new URLSearchParams(query).has('exam') : false
}

/**
 * This page's own address, carrying whatever origin it was opened with — for
 * use as the origin of a link that goes one level *deeper*.
 *
 * Without it the chain breaks a level down: opening Printables from the exam
 * list, then a Mark Sheet, then pressing Back twice lands on Basic Info,
 * because Printables lost the list origin on the way through. Nesting is safe
 * because `resolveBackHref` unwraps exactly one level, so each page recovers
 * the address of the page that opened it and no more.
 */
export function selfOrigin(path: string, from: string | string[] | undefined): string {
  const origin = resolveBackHref(from, '')
  return origin ? withOrigin(path, origin) : path
}
