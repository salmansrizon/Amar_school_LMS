import Link from 'next/link'
import type { ReactNode } from 'react'

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
    <section className="flex items-start gap-3 rounded-2xl border border-line bg-paper p-card">
      {icon && (
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${SOFT[tone]}`} aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm text-muted">{label}</h2>
        <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
        {note && <p className={`mt-0.5 text-xs font-medium ${TEXT[noteTone ?? tone]}`}>{note}</p>}
      </div>
      {action && (
        <Link href={action.href} className="shrink-0 text-xs font-semibold text-brand-600 hover:underline">
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
              className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
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
