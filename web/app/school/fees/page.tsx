import Form from 'next/form'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Receipt, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, localeOf, type Lang, formatNumber } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { canOpenScreen } from '@/lib/auth/screens'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { enrolledStudentIds, enrolledIdFilter } from '@/lib/school/offering-roster'
import { selectAllRows } from '@/lib/supabase/select-all'
import { feeStanding, summarizeMonthFees, feePeriodFromParams, feePeriodLabel, type FeeStanding } from '@/lib/fees'
import { schoolCrumbs, headerPrimary, headerSecondary } from '@/lib/school-crumbs'
import { AccountingTabs } from './accounting-tabs'
import { FeeForm, type CollectStudent, type ExistingFeeRecord } from './fee-form'
import { selectClass, filterButtonClass } from '@/components/ui/field'
import { ComboboxField } from '@/components/ui/combobox-field'
import { Card } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { Pager, paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { withParams } from '@/lib/url-params'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { FeeDrawerBody, loadFeeDrawerData, feeDrawerCancelHref } from './fee-drawer'
import { feeColumns, feeSelect } from '@/lib/fee-columns'
import { pageTitle } from '@/lib/page-title'

// Fees & finance (map 013 FC1, new_ui/04-finance-communication/fees-finance),
// following the exam-landing pattern (013 A3): header + subtitle, one-line
// dues warning banner, four stat cards, the collection flow (period picker →
// class roster → FeeForm, unchanged), the month's Fee Collection Records as a
// DataTable (title opens a drawer, one contextual next-step pill per row —
// Remind for Due/Partial standings, Receipt otherwise), then two workflow
// cards — Due and Partial follow-up. One Fee Collection Record per Student per
// month is DB-enforced (0016/#11), so a month is at most a couple of 1000-row
// pages — the headline figures fold those pages, no aggregate needed.

type RecordRow = {
  id: string
  student_id: string
  name: string
  roll: number | null
  pay: number
  fine: number
  adjust: number
  due: number
  method: string
  standing: FeeStanding
  /** Voided (#683): listed, counted in no figure and in no follow-up list. */
  voided: boolean
}

/** A roster student's record for the month, as read for the collection form. */
type RosterFeeRow = {
  id: string
  student_id: string
  pay_amount: number
  fine_amount: number
  adjust_amount: number
  due_amount: number
  fee_amount?: number | null
  payment_method: string
  note: string | null
}

const STANDING_TONE = { paid: 'mint', partial: 'sun', due: 'alert' } as const
const STANDING_LABEL = { paid: 'students.feePaid', partial: 'students.feePartial', due: 'students.feeDue' } as const
const METHODS = ['cash', 'cheque', 'bank'] as const
const PAGE_SIZE = 20

export const generateMetadata = pageTitle('fees.title')

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    class?: string
    month?: string
    year?: string
    student?: string
    q?: string
    standing?: string
    method?: string
    page?: string
    size?: string
    rpage?: string
    rsize?: string
    view?: string
  }>
}) {
  const params = await searchParams
  const now = new Date()
  const {
    class: selectedClass = '',
    month: monthParam,
    year: yearParam,
    student: selectedStudent = '',
    q = '',
    standing = '',
    method = '',
    page,
    size,
    view,
  } = params
  const { month, year } = feePeriodFromParams(monthParam, yearParam, {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  })
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  // The class roster above the records pages on its own keys (rpage/rsize).
  const rosterSize = pageSizeFrom(params.rsize, PAGE_SIZE)

  const lang: Lang = await currentLang()
  const { supabase, role, grants, shiftSelection, startedAcademicYears, academicYearSelection } =
    await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1
  // Which optional fee columns the database has (0230 fee_amount, 0231 void).
  const cols = await feeColumns(supabase)

  const [{ data: classes }, { rows: monthRows }] = await Promise.all([
    applyGlobalYearFilterToOfferings(
      applyGlobalShiftFilterToOfferings(
        supabase
          .from('class_offerings')
          .select('id, name, section, group_department, shift, academic_year')
          .order('created_at'),
        shiftSelection,
      ),
      academicYearSelection,
    ),
    selectAllRows((from, to) =>
      supabase
        .from('fee_collection_records')
        .select(
          feeSelect(
            'id, student_id, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, students(full_name, roll_number)',
            { ...cols, feeAmount: false },
          ),
        )
        .eq('month', month)
        .eq('year', year)
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
  ])

  const monthRecords = monthRows as unknown as (RosterFeeRow & {
    void_at?: string | null
    students: { full_name: string; roll_number: number | null } | null
  })[]

  const cls = classes?.find((c) => c.id === selectedClass) ?? null

  let roster: CollectStudent[] = []
  let recordMap = new Map<string, ExistingFeeRecord>()
  let prescribedFee = 0
  let finePerDay = 0

  if (cls) {
    // Roster via the current Enrollment's Class Offering, not class_name/
    // section text — since #593 that pair can match two Offerings and a text
    // match would merge both shifts' students, risking a payment posted
    // against the wrong Student (issue #596). Class/Section shown is the
    // selected Offering's own.
    const enrolledIds = await enrolledStudentIds(supabase, cls.id)
    const [{ data: students }, { data: structure }] = await Promise.all([
      supabase
        .from('students')
        .select('id, full_name, roll_number')
        .in('id', enrolledIdFilter(enrolledIds))
        .is('archived_at', null)
        .order('roll_number'),
      supabase
        .from('fee_structures')
        .select('amount, fine_per_absent_day')
        .eq('class_id', cls.id)
        .eq('academic_year', year)
        .eq('fee_type', 'monthly')
        .maybeSingle(),
    ])
    roster = (students ?? []).map((s) => ({ ...s, class_name: cls.name, section: cls.section }))
    prescribedFee = Number(structure?.amount ?? 0)
    finePerDay = Number(structure?.fine_per_absent_day ?? 0)

    if (roster.length) {
      let rosterRecords = supabase
        .from('fee_collection_records')
        .select(feeSelect('id, student_id, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, note', cols))
        .eq('month', month)
        .eq('year', year)
        .in(
          'student_id',
          roster.map((s) => s.id),
        )
      // A voided record (#683) is not this month's collection: the Student
      // reads "not collected" again and the form opens empty for a new record.
      if (cols.void) rosterRecords = rosterRecords.is('void_at', null)
      const { data } = await rosterRecords
      const records = (data ?? []) as unknown as RosterFeeRow[]
      recordMap = new Map(
        records.map((r) => [
          r.student_id,
          {
            id: r.id,
            pay_amount: Number(r.pay_amount),
            fine_amount: Number(r.fine_amount),
            adjust_amount: Number(r.adjust_amount),
            due_amount: Number(r.due_amount),
            fee_amount: r.fee_amount == null ? null : Number(r.fee_amount),
            payment_method: r.payment_method,
            note: r.note,
          },
        ]),
      )
    }
  }

  const rosterPage = paginate(roster, params.rpage, rosterSize)
  const selectedRow = roster.find((s) => s.id === selectedStudent) ?? null
  const selectedExisting = selectedStudent ? (recordMap.get(selectedStudent) ?? null) : null

  // The month's records → table rows + headline figures.
  const all: RecordRow[] = monthRecords.map((r) => {
    const st = r.students
    const rec = { pay_amount: Number(r.pay_amount), due_amount: Number(r.due_amount) }
    return {
      id: r.id,
      student_id: r.student_id,
      name: st?.full_name ?? '—',
      roll: st?.roll_number ?? null,
      pay: rec.pay_amount,
      fine: Number(r.fine_amount),
      adjust: Number(r.adjust_amount),
      due: rec.due_amount,
      method: r.payment_method,
      standing: feeStanding(rec) ?? 'due',
      voided: Boolean(r.void_at),
    }
  })
  // Every figure, chip and follow-up list below counts active records only.
  const active = all.filter((r) => !r.voided)
  const summary = summarizeMonthFees(active.map((r) => ({ pay_amount: r.pay, due_amount: r.due })))
  const needle = q.trim().toLowerCase()
  const visible = all.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle) || String(r.roll ?? '') === needle) &&
      (!standing || (!r.voided && r.standing === standing)) &&
      (!method || r.method === method),
  )
  const pageData = paginate(visible, page, pageSize)
  const viewed = view ? (all.find((r) => r.id === view) ?? null) : null
  const feeDrawerData = viewed ? await loadFeeDrawerData(viewed.student_id, viewed.id) : null

  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const period = feePeriodLabel(month, year, localeOf(lang))
  // The dues links open the students directory on THIS page's month — without
  // it the directory shows the current month, where July's ten unpaid are zero.
  const duesListHref = `/school/students?fee=due&month=${month}&year=${year}`
  const withDues = summary.partial + summary.unpaid
  const billed = summary.collected + summary.due
  const rate = billed ? Math.round((summary.collected / billed) * 100) : 0
  const canStudents = canOpenScreen(role, grants, 'students')
  const canSms = canOpenScreen(role, grants, 'sms')
  const methodLabel = (m: string) =>
    (METHODS as readonly string[]).includes(m) ? t(`fees.${m}` as 'fees.cash', lang) : m
  // The record's one contextual next step: a Due/Partial standing still needs
  // money, so Remind (SMS) leads; a settled record's next step is its Receipt.
  const nextStepFor = (r: RecordRow): { state: 'next' | 'default'; href: string; label: string } =>
    canSms && !r.voided && r.standing !== 'paid'
      ? { state: 'next', href: `/school/sms?students=${r.student_id}`, label: t('students.remind', lang) }
      : { state: 'default', href: `/school/fees/receipt/${r.id}`, label: t('fees.receipt', lang) }
  const dueRows = active.filter((r) => r.standing === 'due')
  const partialRows = active.filter((r) => r.standing === 'partial')
  const canVoid = cols.void && role === 'school_owner'

  const columns: Column<RecordRow>[] = [
    {
      key: 'student',
      header: t('fees.student', lang),
      card: 'title',
      cell: (r) => (
        <div className="min-w-0">
          <Link
            href={withParams(params, { view: r.id })}
            scroll={false}
            data-view-link={r.id}
            className="truncate font-semibold hover:text-brand-600 hover:underline max-sm:-my-3 max-sm:block max-sm:py-3"
          >
            {r.name}
          </Link>
          <div className="text-xs text-muted">
            {t('students.roll', lang)} {r.roll != null ? formatNumber(r.roll, lang) : '—'} · {period}
          </div>
        </div>
      ),
    },
    { key: 'pay', header: t('fees.pay', lang), align: 'right', cell: (r) => tk(r.pay) },
    {
      key: 'fineAdjust',
      header: `${t('fees.fine', lang)} / ${t('fees.adjust', lang)}`,
      align: 'right',
      cell: (r) =>
        r.fine || r.adjust ? (
          <span className="text-xs">
            +{tk(r.fine)} / −{tk(r.adjust)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'due',
      header: t('fees.due', lang),
      align: 'right',
      cell: (r) => <span className={r.due > 0 ? 'font-semibold text-alert-deep' : ''}>{tk(r.due)}</span>,
    },
    { key: 'method', header: t('fees.method', lang), cell: (r) => methodLabel(r.method) },
    {
      key: 'standing',
      header: t('fees.status', lang),
      card: 'badge',
      // Due fees need attention now; paid/partial are informational, no pulse.
      cell: (r) =>
        r.voided ? (
          <Pill tone="muted">{t('fees.voided', lang)}</Pill>
        ) : (
          <Pill tone={STANDING_TONE[r.standing]} pulse={r.standing === 'due'}>
            {t(STANDING_LABEL[r.standing], lang)}
          </Pill>
        ),
    },
  ]

  const rosterColumns: Column<CollectStudent>[] = [
    {
      key: 'name',
      header: t('students.name', lang),
      card: 'title',
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{s.full_name}</div>
          <div className="text-xs text-muted">
            {t('students.roll', lang)} {s.roll_number != null ? formatNumber(s.roll_number, lang) : '—'} · {[s.class_name, s.section].filter(Boolean).join(' / ')}
          </div>
        </div>
      ),
    },
    { key: 'month', header: t('fees.month', lang), cell: () => period },
    {
      key: 'status',
      header: t('fees.status', lang),
      card: 'badge',
      cell: (s) =>
        recordMap.has(s.id) ? (
          // Same verdict as the records table: a record with money still due is
          // not "collected" (#704).
          (() => {
            const rec = recordMap.get(s.id)!
            const standing = feeStanding({ pay_amount: Number(rec.pay_amount), due_amount: Number(rec.due_amount) }) ?? 'due'
            return standing === 'paid' ? (
              <Pill tone="mint">{t('fees.collected', lang)}</Pill>
            ) : (
              <Pill tone={STANDING_TONE[standing]}>{t(STANDING_LABEL[standing], lang)}</Pill>
            )
          })()
        ) : (
          <Pill tone="sun">{t('fees.notCollected', lang)}</Pill>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('fees.title', lang)}
        subtitle={t('fees.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, [{ label: t('fees.title', lang) }])}
        badge={`${t('fees.month', lang)}: ${period}`}
        actions={
          <>
            <Link href="/school/fees/structures" className={headerSecondary}>
              {t('fees.tabStructures', lang)}
            </Link>
            <Link href="/school/fees/ledger" className={headerSecondary}>
              {t('fees.tabLedger', lang)}
            </Link>
            <Link href="#collect" className={headerPrimary}>
              + {t('fees.collect', lang)}
            </Link>
          </>
        }
      />

      <AccountingTabs active="collection" lang={lang} />

      {withDues > 0 && canStudents && (
        <WarningBanner
          label={t('fees.attention', lang)}
          text={`${fmt.format(withDues)} ${t('fees.alertDues', lang)} · ${t('fees.due', lang)}: ${tk(summary.due)}`}
          href={duesListHref}
          linkLabel={t('fees.alertDuesAction', lang)}
        />
      )}

      <StatGrid>
        <StatCard
          icon={<CheckCircle2 className="size-5" />}
          tone="mint"
          label={t('fees.statCollected', lang)}
          value={tk(summary.collected)}
          progress={billed ? rate : undefined}
          note={`${fmt.format(rate)}% ${t('fees.statCollectedRate', lang)}`}
        />
        <StatCard
          icon={<Wallet className="size-5" />}
          tone="alert"
          label={t('fees.statDue', lang)}
          value={tk(summary.due)}
          note={`${t('students.feePartial', lang)} ${fmt.format(summary.partial)} · ${t('students.feeDue', lang)} ${fmt.format(summary.unpaid)}`}
          action={
            canStudents ? { href: duesListHref, label: t('fees.statDueList', lang) } : undefined
          }
        />
        <StatCard
          icon={<Receipt className="size-5" />}
          label={t('fees.statRecords', lang)}
          value={fmt.format(summary.records)}
          note={`${t('students.feePaid', lang)} ${fmt.format(summary.paid)}`}
          noteTone="mint"
        />
        <StatCard
          icon={<AlertTriangle className="size-5" />}
          tone={withDues ? 'sun' : 'muted'}
          label={t('fees.statWithDues', lang)}
          value={fmt.format(withDues)}
          note={t('fees.statWithDuesNote', lang)}
          noteTone="muted"
        />
      </StatGrid>

      <section id="collect" className="mb-section scroll-mt-4">
        <Card className="mb-grid">
          <h2 className="mb-3 font-bold">{t('fees.tabCollection', lang)}</h2>
          <Form className="flex flex-wrap items-center gap-2" action="/school/fees">
            <ComboboxField
              name="class"
              defaultValue={selectedClass}
              aria-label={t('fees.class', lang)}
              options={[
                { value: '', label: t('fees.allClasses', lang) },
                ...(classes ?? []).map((c) => ({ value: c.id, label: classCatalogueLabel(c, showYear) })),
              ]}
            />
            <ComboboxField
              name="month"
              defaultValue={String(month)}
              aria-label={t('fees.month', lang)}
              options={Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({ value: String(m), label: String(m) }))}
            />
            <input
              name="year"
              type="number"
              min={2000}
              max={2100}
              defaultValue={year}
              aria-label={t('fees.year', lang)}
              className={`${selectClass()} w-24`}
            />
            <button
              type="submit"
              className={filterButtonClass()}
            >
              {t('classes.filter', lang)}
            </button>
          </Form>
          {!cls && <p className="mt-3 text-sm text-muted">{t('fees.pickClassPrompt', lang)}</p>}
        </Card>

        {cls && (
          <DataTable
            rows={rosterPage.items}
            rowId={(s) => s.id}
            rowLabel={(s) => s.full_name}
            columns={rosterColumns}
            lang={lang}
            params={params}
            caption={t('fees.tabCollection', lang)}
            rowActions={(s) => {
              const collected = recordMap.has(s.id)
              // The row you just clicked stays marked by the form below it (#531).
              return (
                <RowActionPill
                  state={collected ? 'done' : 'next'}
                  href={`/school/fees?class=${selectedClass}&month=${month}&year=${year}&student=${s.id}${params.rpage ? `&rpage=${params.rpage}` : ''}${params.rsize ? `&rsize=${params.rsize}` : ''}#collect-form`}
                  label={t(collected ? 'fees.editRecord' : 'fees.collectAction', lang)}
                />
              )
            }}
            empty={
              <Card>
                <p className="text-sm text-muted">{t('fees.noStudentsInClass', lang)}</p>
              </Card>
            }
          />
        )}
        {cls && roster.length > 0 && (
          <Pager page={rosterPage.page} totalPages={rosterPage.totalPages} total={rosterPage.total} lang={lang} params={params} pageSize={rosterSize} pageParam="rpage" sizeParam="rsize" />
        )}

        {selectedRow && (
          <>
            {selectedExisting && (
              <div className="mt-grid rounded-lg border border-sun-deep/30 bg-sun-soft p-4">
                <p className="text-xs text-sun-deep">{t('fees.duplicateNote', lang)}</p>
              </div>
            )}
            <Card className="mt-grid">
              <div id="collect-form" className="scroll-mt-4">
                <FeeForm
                  student={selectedRow}
                  month={month}
                  year={year}
                  existingRecord={selectedExisting}
                  prescribedFee={prescribedFee}
                  finePerDay={finePerDay}
                  lang={lang}
                />
              </div>
            </Card>
          </>
        )}
      </section>

      <h2 className="mb-3 font-bold">
        {t('fees.records', lang)} · {period}
      </h2>
      <DataTable
        rows={pageData.items}
        rowId={(r) => r.id}
        rowLabel={(r) => r.name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('fees.records', lang)}
        search={{ placeholder: t('fees.searchRecords', lang) }}
        filters={[
          {
            param: 'standing',
            label: t('fees.status', lang),
            options: (['paid', 'partial', 'due'] as const).map((v) => ({ value: v, label: t(STANDING_LABEL[v], lang) })),
          },
          {
            param: 'method',
            label: t('fees.method', lang),
            options: METHODS.map((m) => ({ value: m, label: methodLabel(m) })),
          },
        ]}
        chips={[
          { param: 'standing', value: 'due', label: `${t('students.feeDue', lang)} (${fmt.format(summary.unpaid)})` },
          {
            param: 'standing',
            value: 'partial',
            label: `${t('students.feePartial', lang)} (${fmt.format(summary.partial)})`,
          },
          { param: 'standing', value: 'paid', label: `${t('students.feePaid', lang)} (${fmt.format(summary.paid)})` },
        ]}
        rowActions={(r) => {
          const next = nextStepFor(r)
          return <RowActionPill state={next.state} href={next.href} label={next.label} />
        }}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          all.length ? (
            <EmptyState
              title={t('fees.noMatch', lang)}
              action={{ href: `/school/fees?month=${month}&year=${year}`, label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState title={t('fees.none', lang)} action={{ href: '#collect', label: t('fees.collect', lang) }} lang={lang} />
          )
        }
      />

      <div className="ui-stagger mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard icon={<Wallet className="size-5" />} title={t('fees.workflowDuesTitle', lang)} tag={t('students.thisMonthTag', lang)}>
          {dueRows.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('fees.workflowDuesEmpty', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {dueRows.slice(0, 5).map((r) => {
                const next = nextStepFor(r)
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.name}</p>
                      <p className="text-xs text-muted">{tk(r.due)}</p>
                    </div>
                    <RowActionPill state={next.state} href={next.href} label={next.label} />
                  </li>
                )
              })}
            </ul>
          )}
        </WorkflowCard>

        <WorkflowCard
          icon={<Receipt className="size-5" />}
          title={t('fees.workflowPartialTitle', lang)}
          tag={t('students.thisMonthTag', lang)}
        >
          {partialRows.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('fees.workflowPartialEmpty', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {partialRows.slice(0, 5).map((r) => {
                const next = nextStepFor(r)
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.name}</p>
                      <p className="text-xs text-muted">{tk(r.due)}</p>
                    </div>
                    <RowActionPill state={next.state} href={next.href} label={next.label} />
                  </li>
                )
              })}
            </ul>
          )}
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.name ?? ''}
        header={viewed && <DrawerHeader name={viewed.name} avatarId={viewed.student_id} subtitle={period} />}
        footer={
          viewed && (
            <DrawerFooter
              cancelHref={feeDrawerCancelHref(params)}
              cancelLabel={t('routine.cancel', lang)}
              primary={{ href: nextStepFor(viewed).href, label: nextStepFor(viewed).label }}
            />
          )
        }
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <FeeDrawerBody
            record={viewed}
            data={feeDrawerData ?? { history: [] }}
            lang={lang}
            voidHref={canVoid ? `/school/fees/receipt/${viewed.id}` : undefined}
          />
        )}
      </RecordDrawer>
    </>
  )
}
