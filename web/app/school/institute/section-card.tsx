import type { ReactNode } from 'react'

// One settings section, per new_ui/05-administration/institution-settings:
// icon tile + title + one-line hint over a hairline, then the fields.
export function SectionCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-card">
      <header className="mb-grid flex items-start gap-3 border-b border-line pb-grid">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}
