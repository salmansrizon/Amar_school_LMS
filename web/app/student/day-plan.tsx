import { t, formatNumber, type Lang } from '@/lib/i18n'
import type { DayPlan } from '@/lib/student/routine'

// One day of the Student's routine (#444), as the body of the home's
// "today's routine" card. The weekly grid renders its own table.
//
// The empty states are the point. A day with no periods can be four different
// things, and a Student staring at a blank card cannot tell a holiday from a
// routine nobody has published — so each says which it is.

/** Why a day has no classes, in words. */
export function emptyDayMessage(plan: DayPlan, lang: Lang): string {
  return plan.kind === 'off-day'
    ? plan.offDayLabel || t('student.offDay', lang)
    : plan.kind === 'weekend'
      ? t('student.weekend', lang)
      : t('student.noRoutine', lang)
}

export function EmptyDay({ plan, lang }: { plan: DayPlan; lang: Lang }) {
  return (
    <p className="py-6 text-center text-sm text-muted">
      {plan.kind === 'off-day' && <span className="mr-1" aria-hidden>🎉</span>}
      {emptyDayMessage(plan, lang)}
    </p>
  )
}

export function PeriodList({ plan, lang }: { plan: DayPlan; lang: Lang }) {
  return (
    <ul className="divide-y divide-line">
      {plan.periods.map((p) => (
        <li key={p.period} className="flex items-baseline gap-3 py-2">
          <span className="w-8 shrink-0 text-xs font-semibold text-brand-700">{formatNumber(p.period, lang)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.subject_name ?? '—'}</span>
            <span className="block truncate text-xs text-muted">
              {[p.teacher_name, p.room_name].filter(Boolean).join(' · ')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
