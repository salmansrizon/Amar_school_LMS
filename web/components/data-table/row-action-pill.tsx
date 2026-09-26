import Link from 'next/link'
import { Check, Lock } from 'lucide-react'
import type { RowActionState } from '@/lib/exam-setup'

// Colour-coded row action pill (map 013 sweep, jev-picked candidate
// a-four-state-pills): a Link when the action is reachable, a disabled button
// explaining what's missing when it's not — the same shape exam-action.tsx's
// ExamAction always had, generalised so any DataTable row can use it. `next`
// is the one thing to do now (filled brand); `done` marks a prerequisite
// already satisfied (mint + check); `locked` is unavailable, its `reason` the
// tooltip explaining why (muted + lock); `default` is any other reachable
// action (today's plain outline, unchanged). Colour is never the only
// signal — every state keeps the label, and `locked`/`done` add an icon too.

const BASE =
  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2'

export const rowActionPillClass: Record<RowActionState, string> = {
  next: `${BASE} cursor-pointer bg-brand-500 text-white hover:bg-brand-600 motion-safe:active:scale-95`,
  done: `${BASE} cursor-pointer bg-mint-soft text-mint-deep hover:bg-mint-soft/70 motion-safe:active:scale-95`,
  locked: `${BASE} cursor-not-allowed border border-line bg-paper-muted text-muted opacity-70`,
  default: `${BASE} cursor-pointer border border-line-strong hover:bg-paper-muted motion-safe:active:scale-95`,
}

/**
 * One row action, coloured by its state. `reason` gates it exactly as
 * ExamAction always has — passing it renders a disabled, titled button
 * instead of a live link, whatever `state` says, so a disabled action never
 * misstates why it's disabled.
 */
export function RowActionPill({
  state,
  href,
  label,
  reason,
  scroll,
  className,
}: {
  state: RowActionState
  href: string
  label: string
  reason?: string
  /** false for a same-page `?view=` link (record drawer), matching the name
   *  link's own `scroll={false}` — no jump-to-top for a query-only change. */
  scroll?: boolean
  /** Extra classes appended to the pill's own — e.g. the exams row's
   *  `max-md:flex-1` so it fills the phone card's action row instead of
   *  sitting shrink-wrapped beside the ⋮ (map 013 mobile sweep). */
  className?: string
}) {
  if (reason) {
    return (
      <button type="button" disabled title={reason} className={`${rowActionPillClass.locked} ${className ?? ''}`}>
        <Lock className="size-3" aria-hidden="true" />
        {label}
      </button>
    )
  }
  return (
    <Link href={href} scroll={scroll} className={`${rowActionPillClass[state]} ${className ?? ''}`}>
      {state === 'done' && <Check className="size-3" aria-hidden="true" />}
      {label}
    </Link>
  )
}
