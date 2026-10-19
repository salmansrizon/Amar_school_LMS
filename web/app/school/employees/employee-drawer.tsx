import { Briefcase, CalendarOff, Clock, Phone } from 'lucide-react'
import { getSchoolContext } from '@/lib/school/context'
import { employeeCategoryLabel } from '@/lib/employees'
import { t, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, DrawerSection, DrawerItemCard, type DrawerFact } from '@/components/data-table/drawer-parts'
import { LeaveStatusPill } from '@/app/school/attendance/leave/leave-shared'
import { EmployeeProfile } from './[id]/employee-profile'

// Employee record drawer body (drawer redesign): role/category (translated,
// same lookup employees/page.tsx already uses), phone, today's presence, and
// a recent-Leaves section — real employee_leaves rows, fetched only for the
// open ?view= id. Category translation reuses lib/employees.ts's own map
// rather than re-deriving it, so this never drifts from the list column.

type LeaveRow = { id: string; from_day: string; to_day: string; status: string; reason: string | null }
export type EmployeeDrawerData = { recentLeaves: LeaveRow[] }

export type EmployeePresence = 'present' | 'on_leave' | 'not_in' | 'holiday' | 'no_record'

export type EmployeeDrawerRow = {
  id: string
  full_name: string
  category: string | null
  department: string | null
  mobile: string | null
  presence: EmployeePresence
  entryAt: string | null
}

/** Related data for one Employee's drawer — fetched only for the open `view`
 *  id: the last 3 Leave requests. */
export async function loadEmployeeDrawerData(employeeId: string): Promise<EmployeeDrawerData> {
  const { supabase } = await getSchoolContext()
  const { data } = await supabase
    .from('employee_leaves')
    .select('id, from_day, to_day, status, reason')
    .eq('employee_id', employeeId)
    .order('from_day', { ascending: false })
    .limit(3)
  return { recentLeaves: (data ?? []) as LeaveRow[] }
}

function PresenceValue({ employee, lang }: { employee: EmployeeDrawerRow; lang: Lang }) {
  const time = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  })
  if (employee.presence === 'present') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Pill tone="mint">{t('status.present', lang)}</Pill>
        {employee.entryAt && <span className="text-xs text-muted">{time.format(new Date(employee.entryAt))}</span>}
      </span>
    )
  }
  if (employee.presence === 'on_leave') return <Pill tone="sky">{t('status.on_leave', lang)}</Pill>
  if (employee.presence === 'holiday') return <Pill tone="muted">{t('status.holiday', lang)}</Pill>
  if (employee.presence === 'no_record') return <Pill tone="muted">{t('status.no_record', lang)}</Pill>
  return (
    <Pill tone="muted" pulse>
      {t('employees.notInYet', lang)}
    </Pill>
  )
}

export function EmployeeDrawerBody({
  employee,
  data,
  lang,
}: {
  employee: EmployeeDrawerRow
  data: EmployeeDrawerData
  lang: Lang
}) {
  const facts: DrawerFact[] = [
    {
      icon: <Briefcase className="size-3.5" aria-hidden />,
      label: t('employees.categoryDepartment', lang),
      value: [employee.category ? employeeCategoryLabel(employee.category, lang) : null, employee.department]
        .filter(Boolean)
        .join(' · ') || '—',
    },
    { icon: <Phone className="size-3.5" aria-hidden />, label: t('employees.contact', lang), value: employee.mobile ?? '—' },
    {
      icon: <Clock className="size-3.5" aria-hidden />,
      label: t('employees.todayPresence', lang),
      value: <PresenceValue employee={employee} lang={lang} />,
    },
  ]

  return (
    <div className="space-y-1">
      <DrawerFacts facts={facts} />

      <DrawerSection title={t('employees.leaveSectionTitle', lang)} count={data.recentLeaves.length} defaultOpen={data.recentLeaves.length > 0}>
        {data.recentLeaves.length > 0 ? (
          <div className="space-y-2">
            {data.recentLeaves.map((l) => (
              <DrawerItemCard
                key={l.id}
                icon={<CalendarOff className="size-4" aria-hidden />}
                title={`${l.from_day} – ${l.to_day}`}
                meta={l.reason ? [l.reason] : []}
                status={<LeaveStatusPill status={l.status} lang={lang} />}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('employees.noLeaves', lang)}</p>
        )}
      </DrawerSection>

      <DrawerSection title={t('employees.fullProfileSectionTitle', lang)} defaultOpen={false}>
        <EmployeeProfile id={employee.id} lang={lang} />
      </DrawerSection>
    </div>
  )
}

export function employeeDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
