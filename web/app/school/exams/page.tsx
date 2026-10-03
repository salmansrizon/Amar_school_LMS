import Link from 'next/link'
import { BadgeCheck, CalendarClock, CircleCheck, ClipboardList, FileSearch, Lock, PencilLine, TriangleAlert } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, formatNumber } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { filterOfferingsByYearSelection } from '@/lib/school/year-filter'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { subjectsForClass } from '@/lib/students'
import { schoolToday } from '@/lib/school-time'
import { EXAM_CHIP, examBasicInfoComplete, examChip, examStage, filterExams, type ExamStage, type ExamStageFacts } from '@/lib/exam-setup'
import { loadExamReadiness } from '@/lib/exam-readiness'
import { withOrigin } from '@/lib/back-nav'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { withParams } from '@/lib/url-params'
import { AddExamModal, ExamRowActions, ScrollToExam, type ExamListItem } from './exam-controls'
import { ExamsTabs } from './exams-tabs'
import { ProgressBar, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { RowMore } from '@/components/data-table/row-more'
import { PublishResults } from './[id]/publish-results'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { ExamDrawerBody, loadExamDrawerData, examDrawerCancelHref } from './exam-drawer'
import { pageTitle } from '@/lib/page-title'

// Exams & Results (map 013 A3), laid out as new_ui/03-academics/exams-results:
// header, one-line warning banner, four lifecycle stat cards, the stage-chipped
// progress table (one contextual next step per row; the full six-action set of
// docs/010 §1 stays one click away behind ⋮), then two workflow cards — result
// publish approval and routine & seat planning.
//
// Every stage comes from lib/exam-setup.ts's examStage, the one pure
// classifier the cards, chips, pills and next step all read. Rows carry a
// `from` origin built from the live filters, so Back returns to the row (§5).
// Only data the schema holds is shown: no SMS-on-publish, draft, failed-count
// or export controls, which have no backing feature.

const PAGE_SIZE = 20
const primaryClass =
  'inline-flex h-11 cursor-pointer items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600'

interface ExamRow extends ExamListItem {
  seat_plan_published_at: string | null
  results_published_at: string | null
}

export const generateMetadata = pageTitle('exams.pageTitle')

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    class?: string
    stage?: string
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
  const { q = '', class: classParam = '', stage: stageParam = '', exam: anchorExamId, view } = params
  const { supabase, startedAcademicYears, academicYearSelection } = await getSchoolContext()

  const [{ data: exams }, { data: classes }] = await Promise.all([
    supabase
      .from('exams')
      .select(
        'id, name, exam_year, status, class_id, grading_scheme_id, start_date, seat_plan_published_at, results_published_at',
      )
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

  const all: ExamRow[] = exams ?? []
  const today = schoolToday()

  // Stage facts (map 013 A3): computed only for exams that could possibly be
  // running/upcoming/marksPending/ready — status !== closed and Basic Info
  // complete. Closed and setup-incomplete exams short-circuit inside
  // examStage before ever reading these, so there is no need (and no query)
  // to compute them for the other ~90% of a school's exams.
  const setupItems = all.filter((e) => e.status !== 'closed' && !examBasicInfoComplete(e))
  const activeItems = all.filter((e) => e.status !== 'closed' && examBasicInfoComplete(e))
  const activeIds = activeItems.map((e) => e.id)

  const [{ data: routineRows }, { data: allSubjects }] = await Promise.all([
    activeIds.length
      ? supabase.from('exam_routine_entries').select('exam_id, exam_date').in('exam_id', activeIds)
      : Promise.resolve({ data: [] as { exam_id: string; exam_date: string }[] }),
    activeIds.length
      ? supabase.from('subjects').select('id, name, class_id')
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string | null }[] }),
  ])

  // The exam's latest scheduled sitting (exam_routine_entries.exam_date) is
  // its window's real end; exams.start_date stands in when no routine has
  // been entered yet (examStage's own fallback).
  const lastExamDateByExam = new Map<string, string>()
  for (const r of routineRows ?? []) {
    const cur = lastExamDateByExam.get(r.exam_id)
    if (!cur || r.exam_date > cur) lastExamDateByExam.set(r.exam_id, r.exam_date)
  }

  // Marks-entry target (roster × applicable subjects) per class, shared by
  // every active exam on that class rather than re-queried per exam.
  const classIdsNeeded = [...new Set(activeItems.map((e) => e.class_id).filter((id): id is string => Boolean(id)))]
  const subjectCountByClass = new Map(
    classIdsNeeded.map((cid) => [cid, subjectsForClass(allSubjects ?? [], cid).length]),
  )
  const rosterCounts = await Promise.all(
    classIdsNeeded.map((cid) =>
      supabase
        .from('student_enrollments')
        .select('student_id', { count: 'exact', head: true })
        .eq('class_offering_id', cid)
        .is('closed_at', null),
    ),
  )
  const rosterCountByClass = new Map(classIdsNeeded.map((cid, i) => [cid, rosterCounts[i].count ?? 0]))

  // exam_marks carries one row per (student, subject) actually entered
  // (unique constraint), so a plain row count per exam is the entered count —
  // a head-only count request, never the rows themselves, and every active
  // exam's own count stays far under PostgREST's 1,000-row cap (a roster ×
  // subject grid), so no .range() paging is needed here the way
  // lib/supabase/select-all.ts warns about for larger reads.
  const marksCounts = await Promise.all(
    activeItems.map((e) => supabase.from('exam_marks').select('id', { count: 'exact', head: true }).eq('exam_id', e.id)),
  )
  const enteredByExam = new Map(activeItems.map((e, i) => [e.id, marksCounts[i].count ?? 0]))

  const marksTargetFor = (e: ExamRow) => {
    const roster = e.class_id ? (rosterCountByClass.get(e.class_id) ?? 0) : 0
    const subjects = e.class_id ? (subjectCountByClass.get(e.class_id) ?? 0) : 0
    return roster * subjects
  }
  const stageFactsFor = (e: ExamRow): ExamStageFacts => {
    const total = marksTargetFor(e)
    const entered = enteredByExam.get(e.id) ?? 0
    return { marksComplete: total > 0 && entered >= total, lastExamDate: lastExamDateByExam.get(e.id) ?? null }
  }
  const stageByExam = new Map<string, ExamStage>(all.map((e) => [e.id, examStage(e, today, stageFactsFor(e))]))
  const stageOf = (e: ExamRow) => stageByExam.get(e.id)!

  const runningList = all.filter((e) => stageOf(e) === 'running')
  const upcomingList = all.filter((e) => stageOf(e) === 'upcoming')
  const marksPendingList = all.filter((e) => stageOf(e) === 'marksPending')
  const readyList = all.filter((e) => stageOf(e) === 'ready')

  // The table defaults to live exams (every stage except closed) — history is
  // one chip away, never the landing view. `stage=all` is the explicit escape
  // hatch back to literally everything.
  const matchesStage = (e: ExamRow) => {
    if (!stageParam) return stageOf(e) !== 'closed'
    if (stageParam === 'all') return true
    return stageOf(e) === stageParam
  }
  const shown = filterExams(all, q, classParam, '').filter(matchesStage)
  const pageSize = pageSizeFrom(params.size, PAGE_SIZE)
  const paged = paginate(shown, params.page, pageSize)
  const viewed = view ? (all.find((e) => e.id === view) ?? null) : null
  const examDrawerData = viewed ? await loadExamDrawerData(viewed.id, viewed.class_id) : null

  // The address a destination comes back to: this list, filters as they stand,
  // plus the row that was clicked (map #373).
  const originFor = (examId: string) => {
    const o = new URLSearchParams()
    if (q) o.set('q', q)
    if (classParam) o.set('class', classParam)
    if (stageParam) o.set('stage', stageParam)
    if (paged.page > 1) o.set('page', String(paged.page))
    if (params.size) o.set('size', params.size)
    o.set('exam', examId)
    return `/school/exams?${o.toString()}`
  }

  const fmt = numberFmt(lang)
  const dash = <span className="text-muted">—</span>
  const n = (x: number) => fmt.format(x)

  // Publish status as the reference shows it: a result that is out beats every
  // workflow stage; otherwise the stage says where the exam stands.
  // Label and tone come from the shared chip (lib/exam-setup.ts) the setup
  // page reads too; only the motion and the lock icon are this table's own.
  const publishPill = (e: ExamRow) => {
    const chip = examChip(stageOf(e), e.results_published_at)
    return (
      <Pill tone={EXAM_CHIP[chip].tone} live={chip === 'running'} pulse={chip === 'marksPending' || chip === 'setup'}>
        {chip === 'closed' && <Lock className="mr-1 size-3" aria-hidden />}
        {t(EXAM_CHIP[chip].label, lang)}
      </Pill>
    )
  }

  // The one contextual next step each row surfaces; the full six-action set
  // stays one click away behind ⋮.
  const nextStep = (e: ExamRow): { href: string; label: string } => {
    const to = (sub: string) => withOrigin(`/school/exams/${e.id}${sub}`, originFor(e.id))
    switch (stageOf(e)) {
      case 'setup':
        return { href: to(''), label: t('exams.completeBasicInfo', lang) }
      case 'upcoming':
        if (!lastExamDateByExam.has(e.id)) return { href: to('/routine'), label: t('exams.nextRoutine', lang) }
        if (!e.seat_plan_published_at) return { href: to('/seat-plan'), label: t('exams.nextSeat', lang) }
        return { href: to('/marks-entry'), label: t('exams.nextMarks', lang) }
      case 'running':
      case 'marksPending':
        return { href: to('/marks-entry'), label: t('exams.nextMarks', lang) }
      case 'ready':
        return e.results_published_at
          ? { href: to('/printables'), label: t('exams.nextSheets', lang) }
          : { href: to(''), label: t('exams.publishResults', lang) }
      case 'closed':
      default:
        return { href: to('/printables'), label: t('exams.nextSheets', lang) }
    }
  }

  const progressOf = (e: ExamRow) => {
    const total = marksTargetFor(e)
    const entered = enteredByExam.get(e.id) ?? 0
    return { total, entered, pct: total > 0 ? Math.round((entered / total) * 100) : 0 }
  }

  const columns: Column<ExamRow>[] = [
    {
      key: 'exam',
      header: t('exams.colPeriod', lang),
      card: 'title',
      cell: (e) => {
        const last = lastExamDateByExam.get(e.id)
        return (
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
              {classLabel(e.class_id) ?? formatNumber(e.exam_year, lang, { useGrouping: false })}
              {e.start_date ? ` · ${e.start_date}${last && last !== e.start_date ? ` – ${last}` : ''}` : ''}
            </div>
          </div>
        )
      },
    },
    {
      key: 'subjects',
      header: t('exams.colSubjects', lang),
      cell: (e) => {
        const c = e.class_id ? subjectCountByClass.get(e.class_id) : undefined
        return c === undefined ? dash : `${n(c)}${t('exams.subjectsSuffix', lang)}`
      },
    },
    {
      key: 'examinees',
      header: t('exams.colExaminees', lang),
      cell: (e) => {
        const c = e.class_id ? rosterCountByClass.get(e.class_id) : undefined
        return c === undefined ? dash : `${n(c)}${t('exams.personSuffix', lang)}`
      },
    },
    {
      key: 'progress',
      header: t('exams.colProgress', lang),
      className: 'min-w-44',
      cell: (e) => {
        const { total, entered, pct } = progressOf(e)
        if (!total) return dash
        return (
          <div className="min-w-40">
            <div className="mb-1 flex justify-between text-xs">
              <span>
                {n(entered)} / {n(total)}
              </span>
              <span className="font-semibold">{n(pct)}%</span>
            </div>
            <ProgressBar pct={pct} />
          </div>
        )
      },
    },
    { key: 'publish', header: t('exams.colPublish', lang), card: 'badge', cell: publishPill },
  ]

  // Banner: the most urgent stalled step, one line, one way out.
  const banner = marksPendingList.length
    ? {
        text: `${t('exams.alertMarksOverdue', lang)}: ${marksPendingList
          .slice(0, 3)
          .map((e) => e.name)
          .join(', ')}${marksPendingList.length > 3 ? ` +${n(marksPendingList.length - 3)}` : ''}`,
        href: '/school/exams?stage=marksPending',
      }
    : setupItems.length
      ? {
          text: `${t('exams.setupIncomplete', lang)}: ${n(setupItems.length)} — ${setupItems
            .slice(0, 3)
            .map((e) => e.name)
            .join(', ')}`,
          href: '/school/exams?stage=setup',
        }
      : null

  const liveNow = [...runningList, ...upcomingList]
  const progressPool = [...runningList, ...marksPendingList, ...readyList]
  const agg = progressPool.reduce(
    (a, e) => {
      const p = progressOf(e)
      return { entered: a.entered + p.entered, total: a.total + p.total }
    },
    { entered: 0, total: 0 },
  )
  const aggPct = agg.total ? Math.round((agg.entered / agg.total) * 100) : null
  const publishedCount = all.filter((e) => e.results_published_at).length
  const readyUnpublished = readyList.filter((e) => !e.results_published_at)
  const planningQueue = upcomingList.filter((e) => !lastExamDateByExam.has(e.id) || !e.seat_plan_published_at)
  const stageCount = (st: ExamStage) => all.filter((e) => stageOf(e) === st).length
  const toApprove = readyUnpublished[0]
  const toApproveFacts = toApprove ? await loadExamReadiness(supabase, toApprove) : null

  return (
    <>
      <PageHeader
        title={t('exams.pageTitle', lang)}
        subtitle={t('exams.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang) })}
        badge={`${n(all.length)} ${t('exams.examsWord', lang)}`}
        actions={
          <>
            <Link
              href="/school/exams/result-inquiry"
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
            >
              <FileSearch className="size-4" aria-hidden />
              {t('resultInquiry.title', lang)}
            </Link>
            <AddExamModal lang={lang} triggerClassName={primaryClass} />
          </>
        }
      />

      {banner && (
        <WarningBanner
          label={t('exams.bannerWarn', lang)}
          text={banner.text}
          href={banner.href}
          linkLabel={t('exams.viewIncompleteList', lang)}
        />
      )}

      <StatGrid>
        <StatCard
          icon={<CalendarClock className="size-5" />}
          tone={liveNow.length ? 'brand' : 'muted'}
          label={t('exams.statRunningUpcoming', lang)}
          value={`${n(liveNow.length)} ${t('exams.examsWord', lang)}`}
          note={liveNow.slice(0, 3).map((e) => e.name).join(', ') || undefined}
          noteTone="muted"
          action={liveNow.length ? { href: '/school/exams?stage=running', label: t('students.statView', lang) } : undefined}
        />
        <StatCard
          icon={<PencilLine className="size-5" />}
          tone="brand"
          label={t('exams.statMarksProgress', lang)}
          value={aggPct === null ? '—' : `${n(aggPct)}%`}
          note={agg.total ? `${n(agg.entered)} / ${n(agg.total)} ${t('exams.entriesDone', lang)}` : undefined}
          noteTone="muted"
          action={marksPendingList.length ? { href: '/school/exams?stage=marksPending', label: t('students.statView', lang) } : undefined}
        />
        <StatCard
          icon={<BadgeCheck className="size-5" />}
          tone="mint"
          label={t('exams.statPublished', lang)}
          value={`${n(publishedCount)} ${t('exams.pubPublished', lang)}`}
          note={`${n(readyUnpublished.length)}${t('exams.readyToPublishNote', lang)}`}
          noteTone={readyUnpublished.length ? 'brand' : 'muted'}
          action={readyUnpublished.length ? { href: '/school/exams?stage=ready', label: t('students.statView', lang) } : undefined}
        />
        <StatCard
          icon={<TriangleAlert className="size-5" />}
          tone={setupItems.length ? 'alert' : 'muted'}
          label={t('exams.statNeedsSetup', lang)}
          value={n(setupItems.length)}
          action={setupItems.length ? { href: '/school/exams?stage=setup', label: t('students.statView', lang) } : undefined}
        />
      </StatGrid>

      <ExamsTabs active="/school/exams" lang={lang} />

      <ScrollToExam examId={anchorExamId} />
      <h2 className="mb-grid mt-section text-lg font-extrabold">{t('exams.tableTitle', lang)}</h2>
      <DataTable
        rows={paged.items}
        rowId={(e) => e.id}
        rowLabel={(e) => `${e.name} (${formatNumber(e.exam_year, lang, { useGrouping: false })})`}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('exams.tableTitle', lang)}
        search={{ placeholder: t('exams.searchPlaceholder', lang) }}
        filters={[
          {
            param: 'class',
            label: t('exams.class', lang),
            options: pickerOfferings.map((c) => ({ value: c.id, label: classCatalogueLabel(c, showYear) })),
          },
        ]}
        chips={[
          { param: 'stage', value: 'all', label: `${t('exams.stageAll', lang)} (${n(all.length)})` },
          { param: 'stage', value: 'running', label: `${t('exams.stageRunning', lang)} (${n(stageCount('running'))})` },
          { param: 'stage', value: 'upcoming', label: `${t('exams.stageUpcoming', lang)} (${n(stageCount('upcoming'))})` },
          { param: 'stage', value: 'marksPending', label: `${t('exams.stageMarksPending', lang)} (${n(stageCount('marksPending'))})` },
          { param: 'stage', value: 'ready', label: `${t('exams.stageReady', lang)} (${n(stageCount('ready'))})` },
          { param: 'stage', value: 'setup', label: `${t('exams.stageSetup', lang)} (${n(stageCount('setup'))})` },
          { param: 'stage', value: 'closed', label: `${t('exams.stageClosed', lang)} (${n(stageCount('closed'))})` },
        ]}
        rowActions={(e) => {
          const next = nextStep(e)
          // data-exam-row on the visible part too: ScrollToExam restores the
          // row on Back even while the six actions sit closed behind ⋮.
          return (
            <div data-exam-row={e.id} className="flex items-center justify-end gap-1">
              <RowActionPill
                state="next"
                href={next.href}
                label={next.label}
                className="max-md:flex-1 max-md:justify-center"
              />
              <RowMore label={`${t('exams.moreActions', lang)}: ${e.name}`}>
                <ExamRowActions exam={e} origin={originFor(e.id)} lang={lang} />
              </RowMore>
            </div>
          )
        }}
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

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard
          icon={<BadgeCheck className="size-5" />}
          title={t('exams.workflowTitle', lang)}
          tag={t('exams.finalStep', lang)}
        >
          {toApprove && toApproveFacts ? (
            <>
              <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-600">{t('exams.approvableExam', lang)}</p>
                    <p className="mt-1 font-bold">
                      {toApprove.name} <span className="text-muted">({formatNumber(toApprove.exam_year, lang, { useGrouping: false })})</span>
                    </p>
                    <p className="text-xs text-muted">{classLabel(toApprove.class_id) ?? dash}</p>
                  </div>
                  <p className="shrink-0 text-right text-xs text-muted">
                    {t('exams.marksCompleteShort', lang)}
                    <span className="block text-lg font-extrabold text-mint-deep">{n(100)}%</span>
                  </p>
                </div>
                <p className="mt-3 text-sm text-muted">{t('exams.workflowNote', lang)}</p>
              </div>
              <PublishResults lang={lang} examId={toApprove.id} publishedAt={toApprove.results_published_at} facts={toApproveFacts} />
              {readyUnpublished.length > 1 && (
                <Link href="/school/exams?stage=ready" className="text-xs font-semibold text-brand-600 hover:underline">
                  +{n(readyUnpublished.length - 1)} {t('exams.pubReady', lang)} <span aria-hidden>→</span>
                </Link>
              )}
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('exams.noneToApprove', lang)}
            </p>
          )}
        </WorkflowCard>

        <WorkflowCard
          icon={<CalendarClock className="size-5" />}
          title={t('exams.planningTitle', lang)}
          tag={t('exams.helper', lang)}
        >
          {planningQueue.length ? (
            <ul className="mb-4 divide-y divide-line">
              {planningQueue.slice(0, 5).map((e) => {
                const hasRoutine = lastExamDateByExam.has(e.id)
                const seatDone = Boolean(e.seat_plan_published_at)
                const next = nextStep(e)
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Pill tone={hasRoutine ? 'mint' : 'muted'}>
                          {t(hasRoutine ? 'exams.routineDone' : 'exams.routinePending', lang)}
                        </Pill>
                        <Pill tone={seatDone ? 'mint' : 'muted'}>
                          {t(seatDone ? 'exams.seatPlanDone' : 'exams.seatPlanPending', lang)}
                        </Pill>
                      </div>
                    </div>
                    <RowActionPill state="next" href={next.href} label={next.label} />
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="mb-4 text-center">
              <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600" aria-hidden>
                <ClipboardList className="size-6" />
              </span>
              <p className="font-bold">{t(upcomingList.length ? 'exams.planningEmpty' : 'exams.noneUpcoming', lang)}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('exams.planningHint', lang)}</p>
            </div>
          )}
          <ul className="mb-4 space-y-2 rounded-xl bg-paper-muted p-4 text-sm">
            <li className="flex items-center gap-2">
              <CircleCheck className="size-4 text-mint-deep" aria-hidden />
              {t('exams.checkRoutine', lang)}
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className="size-4 text-mint-deep" aria-hidden />
              {t('exams.checkSeat', lang)}
            </li>
          </ul>
          <div className="mt-auto border-t border-line pt-4 text-center">
            <AddExamModal lang={lang} triggerClassName={primaryClass} />
          </div>
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed ? viewed.name : ''}
        header={
          viewed && (
            <DrawerHeader name={viewed.name} avatarId={viewed.id} subtitle={formatNumber(viewed.exam_year, lang, { useGrouping: false })} status={publishPill(viewed)} />
          )
        }
        footer={
          viewed && (
            <DrawerFooter
              cancelHref={examDrawerCancelHref(params)}
              cancelLabel={t('routine.cancel', lang)}
              primary={{ href: nextStep(viewed).href, label: nextStep(viewed).label }}
            />
          )
        }
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <ExamDrawerBody
            exam={viewed}
            classLabel={classLabel(viewed.class_id)}
            lastExamDate={lastExamDateByExam.get(viewed.id) ?? null}
            subjects={examDrawerData?.subjects ?? []}
            origin={originFor(viewed.id)}
            lang={lang}
          />
        )}
      </RecordDrawer>
    </>
  )
}
