import Link from 'next/link'
import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

// Pieces of the exam landing (map 013 A3, new_ui/03-academics/exams-results)
// that the shared kit has no shape for: the one-line warning banner, the two
// bottom workflow cards, and the marks-entry progress bar.

/** One-line amber banner with a single way out, as in the reference. */
export function WarningBanner({
  label,
  text,
  href,
  linkLabel,
}: {
  label: string
  text: string
  href: string
  linkLabel: string
}) {
  return (
    <div
      role="status"
      className="mb-section flex flex-wrap items-center gap-3 rounded-2xl border border-sun/40 bg-sun-soft px-card py-3"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sun/30 text-sun-deep" aria-hidden>
        <TriangleAlert className="size-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-bold text-sun-deep">{label}:</span> {text}
      </p>
      <Link href={href} className="shrink-0 text-sm font-semibold text-brand-600 hover:underline">
        {linkLabel} <span aria-hidden>→</span>
      </Link>
    </div>
  )
}

/** Bottom-row card: icon + title + small tag, then the body. */
export function WorkflowCard({
  icon,
  title,
  tag,
  children,
}: {
  icon: ReactNode
  title: string
  tag?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-paper p-card">
      <header className="mb-4 flex items-center gap-2 border-b border-line pb-3">
        <span className="text-brand-600" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 font-bold">{title}</h2>
        {tag && <span className="rounded-md bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">{tag}</span>}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}

/** Marks-entry progress bar: a track + a filled portion, clamped. The caller
 *  always prints the ratio beside it, so the bar is never the only signal. */
export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const tone = clamped >= 100 ? 'bg-mint-deep' : clamped >= 50 ? 'bg-sun' : 'bg-brand-500'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-muted">
      <div
        className={`h-full rounded-full ${tone} motion-safe:transition-[width] motion-safe:duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
