import Link from 'next/link'
import { CalendarCheck, ClipboardList, Lock, TriangleAlert } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { filterOfferingsByYearSelection } from '@/lib/school/year-filter'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { examBasicInfoComplete, filterExams } from '@/lib/exam-setup'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { AlertStrip, StatCard, StatGrid } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { withParams } from '@/lib/url-params'
import { AddExamModal, ExamRowActions, ScrollToExam, type ExamListItem } from './exam-controls'
import { ExamsTabs } from './exams-tabs'

// Exams & Results (map 013 A3, new_ui/03-academics/exams-results): header with
// "New exam" modal, alert strip + stat cards, then the exam list on DataTable
// (search + class/status filters in the URL) with a record drawer (`?view=`).
// Each row keeps its six actions (docs/010_exam_module.md §1, map #373) and
// carries a `from` origin built from the live filters, so Back returns to this
// row (§5). grading_scheme_id rides along because Marks Entry and Documents
// are gated on it, while Co-Curricular, Seat Plan and Routine need only the class.

const PAGE_SIZE = 20
const primaryClass =
  'inline-flex h-11 cursor-pointer items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600'

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    class?: string
    status?: string
    setup?: string
    exam?: string
    page?: string
    size?: string
    view?: string
  }>
}) {
  const lang = await currentLang()
  // Returning from a destination restores the list it was opened from: the
  // filters as they were, and the row that launched it (docs/010_exam_module.md
  // §5 — "returning merely to the Exams & Results URL is not sufficient").
  const params = await searchParams
  const { q = '', class: classParam = '', status: statusParam = '', setup = '', exam: anchorExamId, view } = params
  const { supabase, startedAcademicYears, academicYearSelection } = await getSchoolContext()

  const [{ data: exams }, { data: classes }] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, status, class_id, grading_scheme_id, start_date')
      .order('created_at', { ascending: false })
      // ponytail: newest 500. A school runs a handful of exams a year, and the
      // filters below run over what arrives — so this is a guard against an
      // unbounded read (#546), not a paging scheme. If a school ever reaches
      // 500 exams, the filters move into the query (#550).
      .limit(500),
    // Fetched unfiltered: this list double-duties as the class-label map for
    // existing exam rows (keyed by class_id), so year-filtering the fetch would
    // blank the label of an exam whose Offering is in a currently-deselected
    // year — the same reason this file is exempt from the Global Shift filter
    // (tests/unit/shift-filter-required.test.ts). The Global Academic Year
    // Selection narrows the *picker options* only (below), never the exam rows
    // or `exams.exam_year`, which is an independent business concept (map #609,
    // T6/#615).
    supabase
      .from('class_offerings')
      .select('id, name, section, group_department, shift, academic_year')
      .order('created_at'),
  ])

  // Started-year history is the signal (#609/#612), not inference from the
  // Offering set — the same boolean the Classes list threads as `showYear`.
  const showYear = startedAcademicYears.length > 1
  // The class filter offers only Offerings inside the current Global Academic
  // Year Selection. Derived in-memory from the already-loaded set rather than
  // a second query, because the primary fetch must stay unfiltered for the
  // label map above.
  const allOfferings = classes ?? []
  const pickerOfferings = filterOfferingsByYearSelection(allOfferings, academicYearSelection)
  const classById = new Map(allOfferings.map((c) => [c.id, c]))
  const classLabel = (id: string | null) => {
    const c = id ? classById.get(id) : undefined
    return c ? classCatalogueLabel(c, showYear) : null
  }

  const all: ExamListItem[] = exams ?? []
  const incomplete = all.filter((e) => e.status !== 'closed' && !examBasicInfoComplete(e))
  const openCount = all.filter((e) => e.status !== 'closed').length
  const shown = filterExams(all, q, classParam, statusParam).filter(
    (e) => setup !== 'incomplete' || !examBasicInfoComplete(e),
  )
  const pageSize = pageSizeFrom(params.size, PAGE_SIZE)
  const paged = paginate(shown, params.page, pageSize)
  const viewed = view ? all.find((e) => e.id === view) ?? null : null

  // The address a destination comes back to: this list, filters as they stand,
  // plus the row that was clicked (map #373).
  const originFor = (examId: string) => {
    const o = new URLSearchParams()
    if (q) o.set('q', q)
    if (classParam) o.set('class', classParam)
    if (statusParam) o.set('status', statusParam)
    if (setup) o.set('setup', setup)
    if (paged.page > 1) o.set('page', String(paged.page))
    if (params.size) o.set('size', params.size)
    o.set('exam', examId)
    return `/school/exams?${o.toString()}`
  }

  const fmt = numberFmt(lang)
  const dash = <span className="text-muted">—</span>
  const statusPill = (e: ExamListItem) =>
    e.status === 'closed' ? (
      <Pill tone="muted">
        <Lock className="mr-1 size-3" aria-hidden />
        {t('exams.closed', lang)}
      </Pill>
    ) : examBasicInfoComplete(e) ? (
      <Pill tone="mint">{t('exams.open', lang)}</Pill>
    ) : (
      <Pill tone="sun">{t('exams.setupIncomplete', lang)}</Pill>
    )

  const columns: Column<ExamListItem>[] = [
    {
      key: 'exam',
      header: t('exams.name', lang),
      card: 'title',
      cell: (e) => (
        <div className="min-w-0">
          <Link
            href={withParams(params, { view: e.id })}
            scroll={false}
            data-view-link={e.id}
            className="font-semibold hover:text-brand-600 hover:underline"
          >
            {e.name}
          </Link>
          <div className="text-xs text-muted">
            {e.exam_year}
            {e.start_date ? ` · ${e.start_date}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'class', header: t('exams.class', lang), cell: (e) => classLabel(e.class_id) ?? dash },
    { key: 'status', header: t('codes.status', lang), card: 'badge', cell: statusPill },
  ]

  return (
    <>
      <PageHeader
        title={t('exams.title', lang)}
        crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang) })}
        badge={`${fmt.format(all.length)} ${t('exams.examsWord', lang)}`}
        actions={<AddExamModal lang={lang} triggerClassName={primaryClass} />}
      />

      <AlertStrip
        title={t('exams.alertTitle', lang)}
        alerts={
          incomplete.length
            ? [
                {
                  tone: 'sun',
                  title: `${t('exams.setupIncomplete', lang)}: ${fmt.format(incomplete.length)}`,
                  body: incomplete
                    .slice(0, 3)
                    .map((e) => `${e.name} (${e.exam_year})`)
                    .join(', '),
                  action: { href: '/school/exams?setup=incomplete', label: t('students.statView', lang) },
                },
              ]
            : []
        }
      />

      <StatGrid>
        <StatCard icon={<ClipboardList className="size-5" />} label={t('exams.statTotal', lang)} value={fmt.format(all.length)} />
        <StatCard
          icon={<CalendarCheck className="size-5" />}
          tone="mint"
          label={t('exams.statOpen', lang)}
          value={fmt.format(openCount)}
          action={{ href: '/school/exams?status=open', label: t('students.statView', lang) }}
        />
        <StatCard
          icon={<Lock className="size-5" />}
          tone="muted"
          label={t('exams.statClosed', lang)}
          value={fmt.format(all.length - openCount)}
          action={{ href: '/school/exams?status=closed', label: t('students.statView', lang) }}
        />
        <StatCard
          icon={<TriangleAlert className="size-5" />}
          tone={incomplete.length ? 'sun' : 'muted'}
          label={t('exams.setupIncomplete', lang)}
          value={fmt.format(incomplete.length)}
          action={incomplete.length ? { href: '/school/exams?setup=incomplete', label: t('students.statView', lang) } : undefined}
        />
      </StatGrid>

      <ExamsTabs active="/school/exams" lang={lang} />

      <ScrollToExam examId={anchorExamId} />
      <DataTable
        rows={paged.items}
        rowId={(e) => e.id}
        rowLabel={(e) => `${e.name} (${e.exam_year})`}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('exams.title', lang)}
        search={{ placeholder: t('exams.searchPlaceholder', lang) }}
        filters={[
          {
            param: 'class',
            label: t('exams.class', lang),
            options: pickerOfferings.map((c) => ({ value: c.id, label: classCatalogueLabel(c, showYear) })),
          },
          {
            param: 'status',
            label: t('codes.status', lang),
            options: [
              { value: 'open', label: t('exams.open', lang) },
              { value: 'closed', label: t('exams.closed', lang) },
            ],
          },
        ]}
        chips={[
          {
            param: 'setup',
            value: 'incomplete',
            label: `${t('exams.setupIncomplete', lang)} (${fmt.format(incomplete.length)})`,
          },
        ]}
        rowActions={(e) => <ExamRowActions exam={e} origin={originFor(e.id)} lang={lang} />}
        pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize }}
        empty={
          all.length ? (
            <EmptyState
              title={t('classes.noMatch', lang)}
              action={{ href: '/school/exams', label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState
              title={t('exams.none', lang)}
              action={{ href: '/school/exams/grading-schemes', label: t('grading.title', lang) }}
              lang={lang}
            />
          )
        }
      />

      <p className="mt-3 text-xs text-muted">{t('exams.closedNote', lang)}</p>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed ? viewed.name : ''}
        subtitle={viewed ? String(viewed.exam_year) : undefined}
        fullPageHref={viewed ? `/school/exams/${viewed.id}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {(
                [
                  [t('exams.year', lang), viewed.exam_year],
                  [t('codes.status', lang), statusPill(viewed)],
                  [t('exams.class', lang), classLabel(viewed.class_id) ?? dash],
                  [t('exams.startDate', lang), viewed.start_date ?? dash],
                  [
                    t('examSetup.gradingScheme', lang),
                    viewed.grading_scheme_id ? t('exams.schemeSet', lang) : dash,
                  ],
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <ExamRowActions exam={viewed} origin={originFor(viewed.id)} lang={lang} />
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
