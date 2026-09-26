import { CalendarOff, ListChecks, UserMinus } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { selectAllRows } from '@/lib/supabase/select-all'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { SmsTabs } from '../tabs'
import { AddOffDayForm, DeleteOffDayButton, AddRuleForm, DeleteRuleButton, AddLeaveForm, DeleteLeaveButton } from '../sms-controls'

// Absence SMS Rules (issue #12) under the SMS tab strip (issue #36, PRD §5.7).
// Map 013 FC2: counts as stat cards, each list on a DataTable with its delete
// as the row action. Off-day calendar, exact/range rules and student leave
// management (forms, actions, validation) are unchanged.

type OffDay = { day: string; label: string | null }
type Rule = { id: string; exact_days: number | null; range_from: number | null; range_to: number | null }
type Leave = { id: string; student_id: string; from_day: string; to_day: string }

export default async function SmsRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const lang: Lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase } = await getSchoolContext()

  const [offDays, rules, students, leaves] = await Promise.all([
    supabase.from('off_days').select('day, label').order('day', { ascending: false }).limit(100),
    supabase.from('absence_sms_rules').select('id, exact_days, range_from, range_to').order('created_at'),
    selectAllRows<{ id: string; full_name: string }>((from, to) =>
      supabase.from('students').select('id, full_name').order('full_name').order('id').range(from, to),
    ),
    supabase
      .from('student_leaves')
      .select('id, student_id, from_day, to_day')
      .order('from_day', { ascending: false })
      .limit(100),
  ])

  const names = new Map(students.rows.map((s) => [s.id, s.full_name]))
  const offDayRows: OffDay[] = offDays.data ?? []
  const ruleRows: Rule[] = rules.data ?? []
  const leaveRows: Leave[] = leaves.data ?? []
  const none = (
    <Card>
      <p className="text-sm text-muted">{t('locations.empty', lang)}</p>
    </Card>
  )
  const ruleText = (r: Rule) =>
    r.exact_days ? `= ${r.exact_days} ${t('sms.days', lang)}` : `${r.range_from}–${r.range_to} ${t('sms.days', lang)}`

  const offDayCols: Column<OffDay>[] = [
    { key: 'day', header: t('sms.offDayDate', lang), card: 'title', cell: (d) => <span className="font-semibold">{d.day}</span> },
    { key: 'label', header: t('sms.offDayLabel', lang), cell: (d) => d.label ?? '—' },
  ]
  const ruleCols: Column<Rule>[] = [
    { key: 'rule', header: t('sms.ruleCol', lang), card: 'title', cell: (r) => <span className="font-semibold">{ruleText(r)}</span> },
  ]
  const leaveCols: Column<Leave>[] = [
    {
      key: 'student',
      header: t('sms.leaveStudent', lang),
      card: 'title',
      cell: (l) => <span className="font-semibold">{names.get(l.student_id) ?? '—'}</span>,
    },
    { key: 'from', header: t('sms.leaveFrom', lang), cell: (l) => l.from_day },
    { key: 'to', header: t('sms.leaveTo', lang), cell: (l) => l.to_day },
  ]

  return (
    <>
      <PageHeader
        title={t('sms.rules', lang)}
        crumbs={schoolCrumbs('/school/sms/rules', lang, [
          { label: t('sms.centerTitle', lang), href: '/school/sms' },
          { label: t('sms.rules', lang) },
        ])}
      />

      <SmsTabs active="/school/sms/rules" lang={lang} />

      <StatGrid>
        <StatCard icon={<ListChecks className="size-5" />} label={t('sms.rules', lang)} value={fmt.format(ruleRows.length)} />
        <StatCard icon={<CalendarOff className="size-5" />} tone="sun" label={t('sms.offDays', lang)} value={fmt.format(offDayRows.length)} />
        <StatCard icon={<UserMinus className="size-5" />} tone="sky" label={t('sms.leaves', lang)} value={fmt.format(leaveRows.length)} />
      </StatGrid>

      <section className="mb-section">
        <h2 className="mb-3 text-lg font-bold">{t('sms.rules', lang)}</h2>
        <Card className="mb-grid">
          <div className="flex flex-wrap gap-2">
            <AddRuleForm lang={lang} ruleType="exact" />
            <AddRuleForm lang={lang} ruleType="range" />
          </div>
        </Card>
        <DataTable
          rows={ruleRows}
          rowId={(r) => r.id}
          rowLabel={ruleText}
          columns={ruleCols}
          lang={lang}
          params={params}
          caption={t('sms.rules', lang)}
          rowActions={(r) => <DeleteRuleButton id={r.id} lang={lang} />}
          empty={none}
        />
      </section>

      <section className="mb-section">
        <h2 className="mb-3 text-lg font-bold">{t('sms.offDays', lang)}</h2>
        <Card className="mb-grid">
          <AddOffDayForm lang={lang} />
        </Card>
        <DataTable
          rows={offDayRows}
          rowId={(d) => d.day}
          rowLabel={(d) => d.day}
          columns={offDayCols}
          lang={lang}
          params={params}
          caption={t('sms.offDays', lang)}
          rowActions={(d) => <DeleteOffDayButton day={d.day} lang={lang} />}
          empty={none}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t('sms.leaves', lang)}</h2>
        <Card className="mb-grid">
          <AddLeaveForm lang={lang} students={students.rows} />
        </Card>
        <DataTable
          rows={leaveRows}
          rowId={(l) => l.id}
          rowLabel={(l) => names.get(l.student_id) ?? l.id}
          columns={leaveCols}
          lang={lang}
          params={params}
          caption={t('sms.leaves', lang)}
          rowActions={(l) => <DeleteLeaveButton id={l.id} lang={lang} />}
          empty={none}
        />
      </section>
    </>
  )
}
