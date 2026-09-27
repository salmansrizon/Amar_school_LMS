import Link from 'next/link'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

// Dashboard/list widgets from the new_ui reference (map 013, F4). Server
// components; the caller decides what is shown (and filters by canOpenScreen)
// — these only lay it out. Colour is never the only signal: every tone is
// paired with text.

export type WidgetTone = 'brand' | 'mint' | 'sun' | 'alert' | 'sky' | 'muted'

const SOFT: Record<WidgetTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  mint: 'bg-mint-soft text-mint-deep',
  sun: 'bg-sun-soft text-sun-deep',
  alert: 'bg-alert-soft text-alert-deep',
  sky: 'bg-sky-soft text-sky-deep',
  muted: 'bg-paper-muted text-muted',
}
const TEXT: Record<WidgetTone, string> = {
  brand: 'text-brand-600',
  mint: 'text-mint-deep',
  sun: 'text-sun-deep',
  alert: 'text-alert-deep',
  sky: 'text-sky-deep',
  muted: 'text-muted',
}

export type WidgetAction = { href: string; label: string }

/** One headline number: icon tile, label, value, a toned note, one action. */
export function StatCard({
  icon,
  tone = 'brand',
  label,
  value,
  note,
  noteTone,
  action,
}: {
  icon?: ReactNode
  tone?: WidgetTone
  label: string
  value: string
  note?: string
  noteTone?: WidgetTone
  action?: WidgetAction
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-paper p-card">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm text-muted">{label}</h2>
        {icon && (
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${SOFT[tone]}`} aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      {note && <p className={`mt-0.5 text-xs font-medium ${TEXT[noteTone ?? tone]}`}>{note}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-auto self-end pt-3 text-right text-xs font-semibold text-brand-600 hover:underline"
        >
          {action.label} <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-section grid grid-cols-2 gap-grid xl:grid-cols-4">{children}</div>
}

export type Alert = { tone: WidgetTone; title: string; body?: string; action?: WidgetAction }

/** Things needing attention today. Renders nothing when there are none. */
export function AlertStrip({ title, alerts }: { title: string; alerts: Alert[] }) {
  if (!alerts.length) return null
  return (
    <section className="mb-section rounded-2xl border border-line bg-paper p-card">
      <h2 className="mb-3 font-bold">{title}</h2>
      <ul className="grid gap-grid md:grid-cols-2 xl:grid-cols-3">
        {alerts.map((a) => (
          <li
            key={a.title}
            className={`flex items-center gap-3 rounded-xl border border-line p-3 ${SOFT[a.tone].split(' ')[0]}`}
          >
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${TEXT[a.tone]}`}>{a.title}</p>
              {a.body && <p className="text-xs text-muted">{a.body}</p>}
            </div>
            {a.action && (
              <Link
                href={a.action.href}
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-paper px-3 text-xs font-semibold hover:bg-paper-muted"
              >
                {a.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export type QuickActionTone = 'brand' | 'sun' | 'sky' | 'mint'

// Course-card gradient tiles (restyle of the shortcut/quick-action grid to the
// reference: bold hue, giant ghost icon, category/meta/footer text). `brand`
// is dark enough for white text at every stop, in both themes. The other
// three tones stay light-to-bright in dark mode too (app/globals.css's
// --dk-sun/-dk-sky/-dk-mint never darken — that's deliberate, so their soft
// badges elsewhere keep working), so their text is a literal dark, not
// `text-ink` — `ink` flips to near-white under `data-theme=dark` and would
// go unreadable against a background that hasn't actually darkened.
// Ratios (WCAG relative luminance, checked against both gradient stops and
// their midpoint, light + dark): brand/white >=5.12, sun|sky|mint/black >=6.3.
// `alert` (pink-ish) is deliberately not in the rotation: its red already
// means "urgent" elsewhere in this file (AlertStrip, StatCard), and white
// text on it sits at ~3.8-4.4:1 — under the 4.5 small-text floor.
const TONE_BG: Record<QuickActionTone, string> = {
  brand: 'bg-gradient-to-br from-brand-600 to-brand-700',
  sun: 'bg-gradient-to-br from-sun to-sun-deep',
  sky: 'bg-gradient-to-br from-sky to-sky-deep',
  mint: 'bg-gradient-to-br from-mint to-mint-deep',
}
const TONE_TEXT: Record<QuickActionTone, string> = {
  brand: 'text-white',
  sun: 'text-black/85',
  sky: 'text-black/85',
  mint: 'text-black/85',
}
const TONE_MUTED: Record<QuickActionTone, string> = {
  brand: 'text-white/75',
  sun: 'text-black/60',
  sky: 'text-black/60',
  mint: 'text-black/60',
}
const TONE_GHOST: Record<QuickActionTone, string> = {
  brand: 'text-white/20',
  sun: 'text-black/10',
  sky: 'text-black/10',
  mint: 'text-black/10',
}
/** brand -> sun -> sky -> mint, so neighbours in the grid always differ. */
const AUTO_TONES: QuickActionTone[] = ['brand', 'sun', 'sky', 'mint']

export type QuickAction = {
  href: string
  label: string
  icon?: ReactNode
  primary?: boolean
  count?: number
  /** The sidebar group/section this action belongs to, when the caller already
   *  knows it (e.g. via schoolNavGroupForScreen) — omitted, never invented. */
  category?: string
  /** A count or description the caller already loaded for this page (e.g. a
   *  dashboard stat shown elsewhere on the same page) — never fetched fresh. */
  meta?: string
  /** Forces the gradient hue; otherwise `primary` gets brand, the rest rotate
   *  through AUTO_TONES by grid position. */
  tone?: QuickActionTone
}

/** The action's own icon, blown up to illustration size for the card's
 *  bottom-right corner — cloned (not re-picked), so it's still the same icon
 *  as the small label, just how the reference's 3D renders sit in-frame. */
function ghostIcon(icon: ReactNode | undefined, tone: QuickActionTone) {
  if (!isValidElement(icon)) return null
  return cloneElement(icon as ReactElement<{ className?: string }>, {
    className: `size-28 ${TONE_GHOST[tone]} motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-110`,
  })
}

/** The page's most frequent actions, one gradient tile each. `openLabel` is
 *  pre-translated by the caller, like `title` and every action's `label`. */
export function QuickActions({
  title,
  actions,
  openLabel = 'Open',
}: {
  title: string
  actions: QuickAction[]
  openLabel?: string
}) {
  if (!actions.length) return null
  return (
    <section className="mb-section rounded-2xl border border-line bg-paper p-card">
      <h2 className="mb-3 font-bold">{title}</h2>
      <ul className="grid grid-cols-1 gap-grid sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a, i) => {
          const tone = a.tone ?? (a.primary ? 'brand' : AUTO_TONES[i % AUTO_TONES.length])
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                className={`group relative flex h-full min-h-36 flex-col overflow-hidden rounded-3xl p-card shadow-md outline-none transition-shadow motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 hover:shadow-lg motion-safe:hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 sm:min-h-52 lg:min-h-60 ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-4 -bottom-4 rotate-6 select-none"
                >
                  {ghostIcon(a.icon, tone)}
                </span>
                <span className="relative z-10 flex h-full flex-col">
                  {(a.category || a.count != null) && (
                    <span className="flex items-start justify-between gap-2">
                      {a.category ? (
                        <span className={`text-[11px] font-bold tracking-wider uppercase ${TONE_MUTED[tone]}`}>
                          {a.category}
                        </span>
                      ) : (
                        <span />
                      )}
                      {a.count != null && (
                        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-black/80 px-1.5 text-[11px] font-bold text-white">
                          {a.count}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="mt-2 line-clamp-2 text-lg leading-tight font-extrabold text-balance">
                    {a.label}
                  </span>
                  {a.meta && <span className={`mt-1 line-clamp-2 text-xs font-medium ${TONE_MUTED[tone]}`}>{a.meta}</span>}
                  <span className={`mt-auto inline-flex items-center gap-1 pt-4 text-xs font-semibold ${TONE_MUTED[tone]}`}>
                    {openLabel} <span aria-hidden>→</span>
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// From the exam landing (map 013, new_ui/03-academics/exams-results), shared by every section page.

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
