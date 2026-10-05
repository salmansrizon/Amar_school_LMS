import Link from 'next/link'
import type { ReactNode } from 'react'
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

/** Solid fill per tone: progress bars and status dots. */
const FILL: Record<WidgetTone, string> = {
  brand: 'bg-brand-500',
  mint: 'bg-mint-deep',
  sun: 'bg-sun',
  alert: 'bg-alert',
  sky: 'bg-sky',
  muted: 'bg-line-strong',
}

export type WidgetAction = { href: string; label: string }

/** A status dot in the tone's colour. `pulse` adds a slow ping ring for the
 *  one state that should catch the eye (needs action now); decorative, so it
 *  is hidden from assistive tech and still under reduced motion. */
export function ToneDot({ tone, pulse = false }: { tone: WidgetTone; pulse?: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden>
      {pulse && (
        <span className={`absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping ${FILL[tone]}`} />
      )}
      <span className={`relative inline-flex size-2.5 rounded-full ${FILL[tone]}`} />
    </span>
  )
}

/** Course-card look for the status summary row (user reference, map 013):
 *  a light wash of the tone, not a solid fill, so ink text keeps its contrast
 *  in both themes (the -soft tokens flip dark). */
const WASH: Record<WidgetTone, string> = {
  brand: 'from-brand-50 to-brand-500/20',
  mint: 'from-mint-soft to-mint/25',
  sun: 'from-sun-soft to-sun/30',
  alert: 'from-alert-soft to-alert/20',
  sky: 'from-sky-soft to-sky/25',
  muted: 'from-paper-muted to-line/60',
}

/** One headline number: tone wash, small label, value, a toned note, one
 *  action; the icon is drawn large and cropped bottom-right as the card's art. */
export function StatCard({
  icon,
  tone = 'brand',
  label,
  value,
  note,
  noteTone,
  action,
  progress,
}: {
  icon?: ReactNode
  tone?: WidgetTone
  label: string
  value: string
  note?: string
  noteTone?: WidgetTone
  action?: WidgetAction
  /** 0–100: draws a bar in the card's tone under the value (a rate, a share). */
  progress?: number
}) {
  return (
    <section
      className={`relative flex min-h-36 flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-card shadow-sm ring-1 ring-line/60 motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md ${WASH[tone]}`}
    >
      {icon && (
        <span
          className={`pointer-events-none absolute -bottom-5 -right-4 rotate-[-12deg] opacity-25 [&>svg]:size-28 ${TEXT[tone]}`}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <h2 className={`relative flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${TEXT[tone]}`}>
        {tone === 'alert' && <ToneDot tone="alert" pulse />}
        {label}
      </h2>
      <p className="relative mt-2 text-3xl font-extrabold tracking-tight text-ink">{value}</p>
      {progress != null && (
        <div className="relative mt-2 max-w-40">
          <ProgressBar pct={progress} tone={tone} label={label} />
        </div>
      )}
      {note && <p className={`relative mt-1 text-xs font-semibold ${TEXT[noteTone ?? tone]}`}>{note}</p>}
      {action && (
        <Link
          href={action.href}
          className="relative mt-auto self-start pt-4 max-sm:pb-3 text-xs font-bold text-ink/80 hover:underline"
        >
          {action.label} <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="ui-stagger mb-section grid grid-cols-2 gap-grid xl:grid-cols-4">{children}</div>
}

export type Alert = { tone: WidgetTone; title: string; body?: string; action?: WidgetAction }

/** Things needing attention today. Renders nothing when there are none. */
export function AlertStrip({ title, alerts }: { title: string; alerts: Alert[] }) {
  if (!alerts.length) return null
  return (
    <section className="mb-section rounded-2xl border border-line bg-paper p-card">
      <h2 className="mb-3 font-bold">{title}</h2>
      <ul className="ui-stagger grid gap-grid md:grid-cols-2 xl:grid-cols-3">
        {alerts.map((a) => (
          <li
            key={a.title}
            className={`flex items-center gap-3 rounded-xl border border-line p-3 ${SOFT[a.tone].split(' ')[0]}`}
          >
            <ToneDot tone={a.tone} pulse={a.tone === 'alert'} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${TEXT[a.tone]}`}>{a.title}</p>
              {a.body && <p className="text-xs text-muted">{a.body}</p>}
            </div>
            {a.action && (
              <Link
                href={a.action.href}
                className="inline-flex h-9 max-sm:h-11 shrink-0 items-center rounded-full border border-line-strong bg-paper px-3 text-xs font-semibold hover:bg-paper-muted"
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

export type QuickAction = { href: string; label: string; icon?: ReactNode; primary?: boolean; count?: number }

/** The page's most frequent actions, one click each. */
export function QuickActions({ title, actions }: { title: string; actions: QuickAction[] }) {
  if (!actions.length) return null
  return (
    <section className="mb-section rounded-2xl border border-line bg-paper p-card">
      <h2 className="mb-3 font-bold">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition motion-safe:active:scale-95 ${
                a.primary
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'border border-line bg-paper-muted text-ink hover:bg-line'
              }`}
            >
              {a.icon && <span aria-hidden>{a.icon}</span>}
              {a.label}
              {a.count ? (
                <span className="rounded-full bg-brand-500 px-2 text-xs text-white">{a.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
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
  pulse = false,
  children,
}: {
  icon: ReactNode
  title: string
  tag?: string
  /** Ping the tag's dot: the card names a state that needs action now. */
  pulse?: boolean
  children: ReactNode
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-paper p-card">
      <header className="mb-4 flex items-center gap-2 border-b border-line pb-3">
        <span className="text-brand-600" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 font-bold">{title}</h2>
        {tag && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
            {pulse && <ToneDot tone="sun" pulse />}
            {tag}
          </span>
        )}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}

/** A track and a filled portion, clamped to 0–100. The fill grows in on first
 *  paint and slides and re-colours when the value changes. Without `tone` the
 *  colour follows the value (under half brand, half or more amber, complete
 *  green) — the marks-entry rule. The caller always prints the number beside
 *  it, so the bar is never the only signal. */
export function ProgressBar({ pct, tone, label }: { pct: number; tone?: WidgetTone; label?: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const fill = tone ? FILL[tone] : clamped >= 100 ? 'bg-mint-deep' : clamped >= 50 ? 'bg-sun' : 'bg-brand-500'
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
    >
      <div
        className={`ui-bar h-full rounded-full ${fill} motion-safe:transition-[width,background-color] motion-safe:duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
