import { t, type Lang } from '@/lib/i18n'
import type { DayPlan } from '@/lib/student/routine'

// One day of the Student's routine (#444). Shared by the home screen's
// Today/Tomorrow pair; the weekly grid renders its own table.
//
// The empty states are the point. A day with no periods can be four different
// things, and a Student staring at a blank card cannot tell a holiday from a
// routine nobody has published — so each says which it is.

function EmptyDay({ plan, lang }: { plan: DayPlan; lang: Lang }) {
  const message =
    plan.kind === 'off-day'
      ? plan.offDayLabel || t('student.offDay', lang)
      : plan.kind === 'weekend'
        ? t('student.weekend', lang)
        : t('student.noRoutine', lang)

  return (
    <p className="py-6 text-center text-sm text-muted">
      {plan.kind === 'off-day' && <span className="mr-1">🎉</span>}
      {message}
    </p>
  )
}

export function DayPlanCard({
  plan,
  title,
  lang,
}: {
  plan: DayPlan
  title: string
  lang: Lang
}) {
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const [y, m, d] = plan.date.split('-').map(Number)
  const dateLabel = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

  return (
    <section className="rounded-lg border border-line bg-paper p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-muted">{dateLabel}</span>
      </div>

      {plan.kind !== 'classes' ? (
        <EmptyDay plan={plan} lang={lang} />
      ) : (
        <ul className="divide-y divide-line">
          {plan.periods.map((p) => (
            <li key={p.period} className="flex items-baseline gap-3 py-2">
              <span className="w-8 shrink-0 text-xs font-semibold text-brand-700">{p.period}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {p.subject_name ?? '—'}
                </span>
                <span className="block truncate text-xs text-muted">
                  {[p.teacher_name, p.room_name].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
