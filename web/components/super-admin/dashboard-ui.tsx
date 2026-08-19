import Link from 'next/link'
import { StrokeIcon } from '@/components/stroke-icon'
import { FOCUS_RING } from '@/lib/ui-tokens'
import { railClass, type Tone } from '@/components/ui/page'

// Reusable presentational primitives for the super-admin dashboard design
// language (map #171, T1). Server-safe — no client state — so pages and server
// components both render them. The business landing (T3) and schools manager
// (T4) build entirely out of these, so spacing / radius / typography stay in one
// place. Tokens (brand/ink/muted/line/paper) match components/school-shell.tsx.
//
// Re-laid onto the map #370 archetype (gate #372): hairline surfaces
// (rounded-2xl/shadow-sm -> rounded-lg/border, no shadow), status rail on
// KpiCard, and KPI_TONES moved off raw Tailwind emerald/amber/rose onto the
// Family mint/sun/alert tokens everything else in the app uses for the same
// meanings — same prop names (`tone="green"` etc. still works, every caller
// across super-admin is unchanged), different, governed colours underneath.

/** BDT money for display — grouped digits with the ৳ sign. The data layer keeps
 *  amounts as plain numbers (map #171 T2); formatting is the UI's job. */
export function formatTaka(n: number): string {
  return `৳${Math.round(n).toLocaleString('en-US')}`
}

/** Page title strip: heading + optional subtitle on the left, actions on the
 *  right (quick-action buttons, filters). Wraps gracefully on narrow screens. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-extrabold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-medium text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const KPI_TONES = {
  brand: 'bg-brand-50 text-brand-600',
  green: 'bg-mint-soft text-mint-deep',
  amber: 'bg-sun-soft text-sun-deep',
  rose: 'bg-alert-soft text-alert-deep',
} as const

// Same keys as KPI_TONES so callers pass one `tone` prop; this is the only
// place the rail's four-colour vocabulary meets the KPI card's own naming.
const KPI_RAIL: Record<KpiTone, Tone> = { brand: 'brand', green: 'mint', amber: 'sun', rose: 'alert' }

export type KpiTone = keyof typeof KPI_TONES

/** A single headline metric. `delta` is a signed percent vs the previous period
 *  (e.g. +12 / -4); it colours itself and is omitted when undefined. `icon` is an
 *  inline 24x24 stroke SVG child (same convention as the shell nav icons). */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  tone = 'brand',
  icon,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  delta?: number
  tone?: KpiTone
  icon?: React.ReactNode
}) {
  const deltaUp = delta !== undefined && delta >= 0
  return (
    <div className={`flex flex-col gap-3 rounded-lg border border-line bg-paper p-4 sm:p-5 ${railClass(KPI_RAIL[tone])}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold text-muted">{label}</span>
        {icon && (
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-md ${KPI_TONES[tone]}`}
            aria-hidden="true"
          >
            <StrokeIcon className="size-5">{icon}</StrokeIcon>
          </span>
        )}
      </div>
      <div className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{value}</div>
      <div className="flex items-center gap-2">
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
              deltaUp ? KPI_TONES.green : KPI_TONES.rose
            }`}
          >
            {deltaUp ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="truncate text-xs font-medium text-muted">{hint}</span>}
      </div>
    </div>
  )
}

/** A titled content panel with an optional right-aligned action. Everything on
 *  the landing / schools pages that isn't a KPI card lives inside one of these. */
export function SectionCard({
  title,
  action,
  bodyClassName = 'p-4 sm:p-5',
  children,
}: {
  title?: string
  action?: React.ReactNode
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-paper">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 className="truncate text-sm font-extrabold text-ink">{title}</h2>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/** A prominent quick-action, rendered as a link (e.g. "+ Create school"). Solid
 *  brand by default; `variant="ghost"` for the secondary action. */
export function QuickAction({
  href,
  label,
  icon,
  variant = 'solid',
}: {
  href: string
  label: string
  icon?: React.ReactNode
  variant?: 'solid' | 'ghost'
}) {
  const styles =
    variant === 'solid'
      ? 'bg-brand-600 text-white hover:bg-brand-700'
      : 'border border-line-strong text-ink hover:bg-brand-50 hover:text-brand-600'
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${FOCUS_RING} ${styles}`}
    >
      {icon && <StrokeIcon className="size-4 shrink-0">{icon}</StrokeIcon>}
      {label}
    </Link>
  )
}
