'use client'

import Link from 'next/link'

// One exam action, enabled or gated. Map #366 gives the exam row and the Basic
// Info header the same set of pill actions, each of which is either a live link
// or a disabled button explaining what is missing — so the shape lives here
// rather than being written out at every call site.

/** Pill styling shared by every exam action, live or gated. `size` matches the
 * two densities already in use: the list row's, and the setup header's. */
export function examActionClass(size: 'row' | 'header' = 'row'): string {
  const padding = size === 'header' ? 'px-3 py-1.5' : 'px-3 py-1'
  return `rounded-full border border-line-strong ${padding} text-xs font-semibold hover:bg-paper-muted`
}

function gatedClass(size: 'row' | 'header'): string {
  const padding = size === 'header' ? 'px-3 py-1.5' : 'px-3 py-1'
  return `cursor-not-allowed rounded-full border border-line ${padding} text-xs font-semibold text-muted opacity-60`
}

/**
 * `reason` is what is missing; passing it gates the action. Each caller supplies
 * the reason that actually applies — "complete Basic Info" where a grading
 * scheme is required, "select a class" where only the class is — so a disabled
 * action never misstates why it is disabled.
 */
export function ExamAction({
  href,
  label,
  reason,
  size = 'row',
}: {
  href: string
  label: string
  reason?: string
  size?: 'row' | 'header'
}) {
  if (reason) {
    return (
      <button type="button" disabled title={reason} className={gatedClass(size)}>
        {label}
      </button>
    )
  }
  return (
    <Link href={href} className={examActionClass(size)}>
      {label}
    </Link>
  )
}
