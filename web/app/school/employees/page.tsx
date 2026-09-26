import Link from 'next/link'
import { CalendarOff, Clock, UserCheck, Users } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { canOpenScreen } from '@/lib/auth/screens'
import { employeeOfficeTimeNames, EMPLOYEE_CATEGORY_LABEL_KEY, isKnownEmployeeCategory } from '@/lib/employees'
import { ACADEMIC_SHIFT_LABEL_KEY, isKnownAcademicShift } from '@/lib/institute'
import { schoolToday } from '@/lib/school-time'
import { selectAllRows } from '@/lib/supabase/select-all'
import { PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { EntityAvatar } from '@/components/entity-avatar'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { AddOfficeTimeForm, CategoryGraceForm, DefaultGraceForm } from './employee-controls'
import { EmployeeProfile, getEmployee } from './[id]/employee-profile'

// Employee directory (map 013, P3), per new_ui/02-people/employees-directory:
// header + stat cards + DataTable (search, filters, presence chips, Profile
// drawer, ⋮ menu). Today's presence is one attendance_records read for today
// (at most one row per employee) plus today's approved leaves. The office-time
// / grace config (issue #9) moved below the table, unchanged.

type Presence = 'present' | 'on_leave' | 'not_in'

type Row = {
  id: string
  full_name: string
  category: string | null
  department: string | null
  qualification: string | null
  mobile: string | null
  unique_id: string | null
  shifts: string[]
  officeTimes: string | null
  presence: Presence
  entryAt: string | null
}

const PAGE_SIZE = 20

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    department?: string
    shift?: string
    presence?: string
    page?: string
    size?: string
    view?: string
  }>
}) {
  const params = await searchParams
  const { q = '', category = '', department = '', shift = '', presence = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase, schoolId, role, grants, configuredShifts } = await getSchoolContext()
  const today = schoolToday()
  const canAttendance = canOpenScreen(role, grants, 'attendance')

  const [
    { data: school },
    { data: officeTimes },
    { data: categoryGrace },
    { rows: employees },
    { rows: assignments },
    { rows: shiftRows },
    { rows: records },
    { rows: leaves },
    viewed,
  ] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', schoolId).single(),
    supabase.from('office_times').select('id, name, grace_minutes').order('name'),
    supabase.from('category_grace_minutes').select('category, grace_minutes').order('category'),
    selectAllRows((from, to) =>
      supabase
        .from('employees')
        .select('id, full_name, category, qualification, department, mobile, unique_id')
        .is('archived_at', null)
        .order('full_name')
        .range(from, to),
    ),
    selectAllRows((from, to) =>
      supabase.from('employee_office_times').select('employee_id, office_time_id').range(from, to),
    ),
    selectAllRows((from, to) => supabase.from('employee_academic_shifts').select('employee_id, shift').range(from, to)),
    selectAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('person_id, entry_at')
        .eq('person_type', 'employee')
        .eq('att_date', today)
        .range(from, to),
    ),
    selectAllRows((from, to) =>
      supabase
        .from('employee_leaves')
        .select('employee_id')
        .eq('status', 'approved')
        .lte('from_day', today)
        .gte('to_day', today)
        .range(from, to),
    ),
    view ? getEmployee(view) : Promise.resolve(null),
  ])

  const entryBy = new Map(records.map((r) => [r.person_id, r.entry_at as string | null]))
  const onLeave = new Set(leaves.map((l) => l.employee_id))
  const shiftsBy = new Map<string, string[]>()
  for (const s of shiftRows) shiftsBy.set(s.employee_id, [...(shiftsBy.get(s.employee_id) ?? []), s.shift])

  const all: Row[] = employees.map((e) => ({
    ...e,
    shifts: shiftsBy.get(e.id) ?? [],
    officeTimes: employeeOfficeTimeNames(e.id, assignments, officeTimes ?? []),
    presence: entryBy.has(e.id) ? 'present' : onLeave.has(e.id) ? 'on_leave' : 'not_in',
    entryAt: entryBy.get(e.id) ?? null,
  }))

  const needle = q.trim().toLowerCase()
  const visible = all.filter(
    (e) =>
      (!needle ||
        e.full_name.toLowerCase().includes(needle) ||
        (e.mobile ?? '').includes(needle) ||
        (e.unique_id ?? '').toLowerCase().includes(needle)) &&
      (!category || e.category === category) &&
      (!department || e.department === department) &&
      (!shift || e.shifts.includes(shift)) &&
      (!presence || e.presence === presence),
  )
  const pageData = paginate(visible, page, pageSize)

  const fmt = numberFmt(lang)
  const count = (p: Presence) => all.filter((e) => e.presence === p).length
  const present = count('present')
  const leaveCount = count('on_leave')
  const notIn = count('not_in')
  const rate = all.length ? Math.round((present / all.length) * 100) : 0

  const categoryLabel = (c: string) =>
    isKnownEmployeeCategory(c) ? t(EMPLOYEE_CATEGORY_LABEL_KEY[c as keyof typeof EMPLOYEE_CATEGORY_LABEL_KEY], lang) : c
  const shiftLabel = (s: string) => (isKnownAcademicShift(s) ? t(ACADEMIC_SHIFT_LABEL_KEY[s], lang) : s)
  const distinct = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort()
  const time = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  })
  const dash = <span className="text-muted">—</span>

  const presencePill = (e: Row) =>
    e.presence === 'present' ? (
      <div>
        <Pill tone="mint">{t('status.present', lang)}</Pill>
        {e.entryAt && (
          <div className="mt-1 text-xs text-muted">
            {t('employees.entryAt', lang)}: {time.format(new Date(e.entryAt))}
          </div>
        )}
      </div>
    ) : e.presence === 'on_leave' ? (
      <Pill tone="sky">{t('status.on_leave', lang)}</Pill>
    ) : (
      // Not checked in yet needs a look; on_leave/present are steady facts, no pulse.
      <Pill tone="muted" pulse>
        {t('employees.notInYet', lang)}
      </Pill>
    )

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('employees.name', lang),
      card: 'title',
      cell: (e) => (
        <div className="flex items-center gap-3">
          <EntityAvatar name={e.full_name} id={e.id} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{e.full_name}</div>
            <div className="text-xs text-muted">
              {[e.qualification, e.unique_id && `${t('employees.uniqueId', lang)} ${e.unique_id}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: t('employees.categoryDepartment', lang),
      cell: (e) => (
        <div>
          <div>{e.category ? categoryLabel(e.category) : dash}</div>
          {e.department && <div className="text-xs text-muted">{e.department}</div>}
        </div>
      ),
    },
    {
      key: 'shift',
      header: t('employees.shift', lang),
      cell: (e) => (
        <div>
          <div>{e.shifts.length ? e.shifts.map(shiftLabel).join(', ') : dash}</div>
          {e.officeTimes && <div className="text-xs text-muted">{e.officeTimes}</div>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('employees.contact', lang),
      cell: (e) => (e.mobile ? <span className="font-mono text-xs">{e.mobile}</span> : dash),
    },
    { key: 'presence', header: t('employees.todayPresence', lang), cell: presencePill },
    {
      key: 'status',
      header: t('employees.status', lang),
      card: 'badge',
      cell: () => <Pill tone="mint">{t('employees.active', lang)}</Pill>,
    },
  ]

  const secondary =
    'inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted'

  return (
    <>
      <PageHeader
        title={t('employees.title', lang)}
        crumbs={{
          lang,
          items: [
            { label: t('dash.dashboard', lang), href: '/school' },
            { label: t('employees.people', lang) },
            { label: t('employees.title', lang) },
          ],
        }}
        badge={`${t('pager.total', lang)}: ${fmt.format(all.length)}`}
        actions={
          <>
            <Link href="/school/employees/archive" className={secondary}>
              {t('employees.oldEmployees', lang)}
            </Link>
            {canAttendance && (
              <Link href="/school/attendance/employee" className={secondary}>
                {t('employees.viewAttendance', lang)}
              </Link>
            )}
            {/* One entry point (issue #566) — login and class assignment are
                optional sections on the same create form. */}
            <Link
              href="/school/employees/new"
              className="inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + {t('employees.add', lang)}
            </Link>
          </>
        }
      />

      <StatGrid>
        <StatCard
          icon={<Users className="size-5" />}
          label={t('dash.totalEmployees', lang)}
          value={fmt.format(all.length)}
          note={t('dash.teachersStaff', lang)}
          noteTone="muted"
        />
        <StatCard
          icon={<UserCheck className="size-5" />}
          tone="mint"
          label={t('employees.presentToday', lang)}
          value={`${fmt.format(present)} / ${fmt.format(all.length)}`}
          note={`${fmt.format(rate)}% ${t('employees.presentRate', lang)}`}
          action={canAttendance ? { href: '/school/attendance/employee', label: t('employees.viewAttendance', lang) } : undefined}
        />
        <StatCard
          icon={<CalendarOff className="size-5" />}
          tone="sky"
          label={t('employees.onLeaveToday', lang)}
          value={fmt.format(leaveCount)}
          note={t('employees.approvedLeave', lang)}
          action={
            canAttendance ? { href: '/school/attendance/leave/employee', label: t('employees.leaveRequests', lang) } : undefined
          }
        />
        <StatCard
          icon={<Clock className="size-5" />}
          tone={notIn ? 'sun' : 'muted'}
          label={t('employees.notInYet', lang)}
          value={fmt.format(notIn)}
          note={t('employees.noRecordYet', lang)}
        />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(e) => e.id}
        rowLabel={(e) => e.full_name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('employees.title', lang)}
        search={{ placeholder: t('employees.searchFull', lang) }}
        filters={[
          {
            param: 'category',
            label: t('employees.category', lang),
            options: distinct(all.map((e) => e.category)).map((c) => ({ value: c, label: categoryLabel(c) })),
          },
          {
            param: 'department',
            label: t('employees.department', lang),
            options: distinct(all.map((e) => e.department)).map((d) => ({ value: d, label: d })),
          },
          ...(configuredShifts.length > 1
            ? [
                {
                  param: 'shift',
                  label: t('employees.shift', lang),
                  options: configuredShifts.map((s) => ({ value: s, label: shiftLabel(s) })),
                },
              ]
            : []),
        ]}
        chips={[
          { param: 'presence', value: 'present', label: `${t('status.present', lang)} (${fmt.format(present)})` },
          { param: 'presence', value: 'on_leave', label: `${t('status.on_leave', lang)} (${fmt.format(leaveCount)})` },
          { param: 'presence', value: 'not_in', label: `${t('employees.notInYet', lang)} (${fmt.format(notIn)})` },
        ]}
        rowActions={(e) => (
          <ViewLink id={e.id} params={params} label={t('table.profile', lang)} name={e.full_name} />
        )}
        rowMenu={(e) => [
          { label: t('employees.view', lang), href: `/school/employees/${e.id}` },
          ...(canAttendance
            ? [
                {
                  label: t('employees.viewAttendance', lang),
                  href: `/school/attendance/employee?q=${encodeURIComponent(e.full_name)}`,
                },
              ]
            : []),
        ]}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          all.length ? (
            <EmptyState
              title={t('employees.noMatch', lang)}
              action={{ href: '/school/employees', label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState
              title={t('employees.none', lang)}
              action={{ href: '/school/employees/new', label: t('employees.add', lang) }}
              lang={lang}
            />
          )
        }
      />

      <section className="mt-section grid gap-4 rounded-lg border border-line bg-paper p-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h2 className="font-bold">{t('employees.graceSettings', lang)}</h2>
          <p className="text-xs text-muted">{t('grace.hint', lang)}</p>
        </div>
        <DefaultGraceForm current={school?.default_grace_minutes ?? null} lang={lang} />
        <AddOfficeTimeForm lang={lang} />
        <CategoryGraceForm lang={lang} />
        <div className="text-xs text-muted sm:col-span-3">
          {officeTimes?.map((s) => (
            <span key={s.id} className="mr-3">
              {s.name}: {s.grace_minutes ?? '—'}m
            </span>
          ))}
          {categoryGrace?.map((c) => (
            <span key={c.category} className="mr-3">
              {c.category}: {c.grace_minutes}m
            </span>
          ))}
        </div>
      </section>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.full_name ?? ''}
        subtitle={viewed?.category ? categoryLabel(viewed.category) : undefined}
        fullPageHref={viewed ? `/school/employees/${viewed.id}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && <EmployeeProfile id={viewed.id} lang={lang} />}
      </RecordDrawer>
    </>
  )
}
