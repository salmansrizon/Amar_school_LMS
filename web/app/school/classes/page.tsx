import Link from 'next/link'
import { BookOpen, CalendarClock, ClipboardList, GraduationCap, School, UserCog, UserX } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang, formatNumber } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import {
  academicYearsOf,
  configuredEducationLevelOptions,
  copyClassesControlVisible,
  copySourceYears,
  countFor,
  filterSubjectsByClass,
  resolveYearFilter,
  showAcademicYearColumn,
  studentCounts,
  visibleClasses,
  visibleSubjects,
  yearFilterOptions,
} from '@/lib/classes'
import { classCatalogueLabel, classCatalogueOptions } from '@/lib/class-catalogue'
import { firstRelation } from '@/lib/supabase/relation'
import { selectAllRows } from '@/lib/supabase/select-all'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { excludeArchivedOfferings } from '@/lib/school/archived-offerings-filter'
import { usedClassOfferingIds } from '@/lib/school/class-offering-usage'
import { isKnownAcademicShift, ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { withParams } from '@/lib/url-params'
import { PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { SectionTabs } from '@/components/ui/section-tabs'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { RowMenu } from '@/components/data-table/row-menu'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { AddClassModal, AddSubjectModal, CopyClassesControl, DeleteButton } from './class-controls'
import { ClassTeacherPicker } from './class-teacher-picker'
import { CopySubjectsBar, type SubjectListRow } from './subject-list-table'
import { stageSubjectCopy } from './actions'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { ClassDrawerBody, classDrawerCancelHref } from './class-drawer'
import { pageTitle } from '@/lib/page-title'

// Class & Curriculum (map 013 A1, new_ui/03-academics/classes-curriculum),
// laid out as the exam landing pattern: header + one-line warning banner +
// four stat cards, then two tabs — Class Offerings and Subjects — each a
// DataTable with a record drawer, and a bottom two-card workflow row (setup
// checklist, routine setup). Rooms moved to Institute Setup -> Venues (issue
// #93); the header's More menu keeps the link across. Every filter/scoping
// rule below is unchanged from the pre-013 page.
//
// Only the Classes tab carries a per-row next step (assign teacher / add
// subjects / set up routine) and a ⋮: Subjects have no lifecycle of their own
// to point a next step at, so that tab keeps its plain Profile action rather
// than faking one (the honesty rule this whole map runs on).

const PAGE_SIZE = 20

const primaryClass =
  'inline-flex h-11 cursor-pointer items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600'
const secondaryClass =
  'inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted'

type Tab = 'classes' | 'subjects'

export const generateMetadata = pageTitle('classes.title')

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    q?: string
    level?: string
    year?: string
    teacher?: string
    subjects?: string
    subjectClass?: string
    copy?: string
    page?: string
    size?: string
    view?: string
  }>
}) {
  const params = await searchParams
  const {
    q = '',
    level = '',
    year: yearParam,
    teacher = '',
    subjects: subjectsGap = '',
    subjectClass = '',
    copy = '',
    page,
    size,
    view,
  } = params
  const tab: Tab = params.tab === 'subjects' ? 'subjects' : 'classes'
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const {
    supabase,
    configuredShifts,
    shiftSelection,
    activeAcademicYear,
    startedAcademicYears,
    academicYearSelection,
    educationLevels,
  } = await getSchoolContext()

  // Choices for the create form are the current Global Shift Selection —
  // parseShiftSelection already guarantees every element is a member of
  // configured_shifts (#577), so no separate intersection is needed.
  const shiftChoices = shiftSelection.filter(isKnownAcademicShift)
  // Add Class's Education Level choices (issue #633) — only the levels this
  // School configured in Institute Setup.
  const educationLevelOptions = configuredEducationLevelOptions(educationLevels)

  const [
    { data: classes },
    { data: subjects },
    { rows: enrollments },
    { data: teachers },
    usedIds,
    { data: groupDepartmentOptionRows },
    { data: subjectVisibleOfferings },
    { rows: routineRows },
  ] = await Promise.all([
    applyGlobalYearFilterToOfferings(
      applyGlobalShiftFilterToOfferings(
        // Archived Class Offerings (ADR 0024) never show on the active
        // list — the new Archived Classes view is where they live.
        excludeArchivedOfferings(
          supabase
            .from('class_offerings')
            .select('id, name, section, education_level, group_department, class_teacher_id, shift, academic_year')
            .order('created_at'),
        ),
        shiftSelection,
      ),
      academicYearSelection,
    ),
    supabase
      .from('subjects')
      .select(
        'id, name, code, theory_marks, mcq_marks, practical_marks, paper_count, class_id, class_offerings(name, section, group_department, shift, academic_year)',
      )
      .order('created_at'),
    // Open enrollments, paged: PostgREST caps one read at 1,000 rows, so the
    // old single `.limit(10000)` read undercounted any school past 1,000.
    selectAllRows((from, to) =>
      supabase
        .from('student_enrollments')
        .select('class_offering_id')
        .is('closed_at', null)
        .order('id')
        .range(from, to),
    ),
    // Class teachers are Employees (#435). Archived staff are not offerable.
    // employee_card, not employees: 0136 gates the base table on the Employees
    // grant, and this picker belongs to Classes. A name is all it wants.
    supabase.from('employee_card').select('id, full_name').is('archived_at', null).order('full_name'),
    // Which visible rows can only be Archived, not Deleted (ADR 0024).
    usedClassOfferingIds(supabase),
    // This School's own custom Group/Department values (issue #635, ADR
    // 0025) — offered in Add Class's dropdown above Other, oldest first.
    supabase.from('school_group_department_options').select('name').order('created_at'),
    // Subject List's own Global Selection scoping (issue #637) —
    // deliberately narrowed by Shift/Academic Year only, NOT by archived
    // status: a Subject configured against an archived Offering is a
    // "resolve existing link" case ADR 0024 says archiving must never
    // disturb. Also backs the Subject List's Class filter (issue #641).
    applyGlobalYearFilterToOfferings(
      applyGlobalShiftFilterToOfferings(
        supabase.from('class_offerings').select('id, name, section, group_department, shift, academic_year'),
        shiftSelection,
      ),
      academicYearSelection,
    ),
    // Routine coverage for the bottom "Routine setup" workflow card: which
    // Offerings have at least one routine_slots entry at all. Paged per
    // select-all.ts — a school's total slot count (classes × periods × days)
    // can pass PostgREST's 1,000-row cap.
    selectAllRows<{ class_offering_id: string }>((from, to) =>
      supabase.from('routine_slots').select('class_offering_id').order('class_offering_id').range(from, to),
    ),
  ])
  const groupDepartmentOptions = (groupDepartmentOptionRows ?? []).map((r) => r.name)

  const allClasses = classes ?? []
  const visibleClassIds = new Set((subjectVisibleOfferings ?? []).map((c) => c.id))
  const subjectsInSelection = visibleSubjects((subjects ?? []) as SubjectListRow[], visibleClassIds)
  const levels = [...new Set(allClasses.map((c) => c.education_level).filter(Boolean))] as string[]
  // Academic Year (issue #597): defaults to the active year; every year the
  // School has Offerings in stays selectable, plus "All years". The per-page
  // choice only narrows within the Global Academic Year Selection (map #609 T5).
  const selectableYears = academicYearsOf(allClasses)
  const yearOptions = yearFilterOptions(selectableYears, activeAcademicYear)
  const showYearColumn = showAcademicYearColumn(startedAcademicYears)
  const subjectClassOptions = classCatalogueOptions(subjectVisibleOfferings ?? [], showYearColumn)
  const selectedYear = showYearColumn
    ? resolveYearFilter(yearParam, { activeYear: activeAcademicYear, presentYears: selectableYears })
    : null
  const counts = studentCounts(enrollments)
  const noTeacher = allClasses.filter((c) => !c.class_teacher_id)
  // Classes with zero Subjects defined yet (the Subjects tab's own scoping —
  // Global Shift/Year selection only, same set that tab renders).
  const subjectCountByClass = new Map<string, number>()
  for (const s of subjectsInSelection) {
    if (s.class_id) subjectCountByClass.set(s.class_id, (subjectCountByClass.get(s.class_id) ?? 0) + 1)
  }
  const noSubjects = allClasses.filter((c) => (subjectCountByClass.get(c.id) ?? 0) === 0)
  // Classes with no entry at all in the weekly routine grid (routine_slots) —
  // the honest "no routine" signal new_ui's academics flowboard shows
  // ("৬ষ্ঠ ও ৭ম শ্রেণির জন্য কোনো সূচি নেই").
  const routinedClassIds = new Set(routineRows.map((r) => r.class_offering_id))
  const noRoutine = allClasses.filter((c) => !routinedClassIds.has(c.id))
  const shownClasses = visibleClasses(allClasses, { q, level, year: selectedYear }).filter(
    (c) => teacher !== 'missing' || !c.class_teacher_id,
  ).filter((c) => subjectsGap !== 'missing' || (subjectCountByClass.get(c.id) ?? 0) === 0)
  const needle = q.trim().toLowerCase()
  const shownSubjects = filterSubjectsByClass(subjectsInSelection, subjectClass).filter(
    (s) => !needle || s.name.toLowerCase().includes(needle) || (s.code ?? '').toLowerCase().includes(needle),
  )

  // "Copy Classes from {year}" (map #609, T8): started years strictly before
  // the active one, counted from the Offering set the page already holds.
  const copySources = copySourceYears(
    startedAcademicYears,
    activeAcademicYear,
    (y) => allClasses.filter((c) => c.academic_year === y).length,
  )

  // Staged "Copy to Class" (issue #642): only ids still visible survive.
  const copyIds = new Set(copy.split(',').filter(Boolean))
  const copySubjects = subjectsInSelection.filter((s) => copyIds.has(s.id))

  const fmt = numberFmt(lang)
  const n = (x: number) => fmt.format(x)
  const dash = <span className="text-muted">—</span>
  const shiftLabel = (s: string | null) => (s ? t(ACADEMIC_SHIFT_LABEL_KEY[s as AcademicShift], lang) : null)
  const enrolledTotal = allClasses.reduce((sum, c) => sum + countFor(counts, c.id), 0)
  const tabParams = { ...params, copy: undefined }

  // Banner: the single most urgent stalled item, one line, one way out — a
  // class with no teacher outranks one with no subjects yet (docs/013).
  const banner = noTeacher.length
    ? {
        text: `${t('classes.classTeacherMissing', lang)}: ${noTeacher
          .slice(0, 3)
          .map((c) => [c.name, c.section].filter(Boolean).join(' - '))
          .join(', ')}${noTeacher.length > 3 ? ` +${n(noTeacher.length - 3)}` : ''}`,
        href: '/school/classes?teacher=missing',
      }
    : noSubjects.length
      ? {
          text: `${t('classes.subjectsMissing', lang)}: ${n(noSubjects.length)} — ${noSubjects
            .slice(0, 3)
            .map((c) => [c.name, c.section].filter(Boolean).join(' - '))
            .join(', ')}`,
          href: '/school/classes?subjects=missing',
        }
      : null

  // The one contextual next step each class row surfaces (map 013's
  // exam-landing pattern): assign a teacher, else define subjects, else build
  // the routine, else just re-open it. The full action set (routine/syllabus/
  // subject assignment) stays one click away behind ⋮. Forces `tab=classes`
  // (rather than reusing whatever tab is current) because the "needs setup"
  // workflow card below renders on both tabs, and the Class record drawer
  // only opens when `viewedClass` is resolved on the Classes tab.
  const classNextStep = (c: ClassRow): { href: string; label: string } => {
    if (!c.class_teacher_id)
      return { href: withParams(params, { tab: null, copy: null, view: c.id }), label: t('classes.assignTeacher', lang) }
    if ((subjectCountByClass.get(c.id) ?? 0) === 0)
      return { href: `/school/classes?tab=subjects&subjectClass=${c.id}`, label: t('classes.addSubjectsAction', lang) }
    if (!routinedClassIds.has(c.id))
      return { href: `/school/classes/routine?class=${c.id}`, label: t('classes.setupRoutineAction', lang) }
    return { href: `/school/classes/routine?class=${c.id}`, label: t('classes.viewRoutineAction', lang) }
  }

  // Bottom workflow cards (map 013): every class still missing a teacher or
  // subjects, and every class with no routine at all.
  const setupQueue = allClasses.filter((c) => !c.class_teacher_id || (subjectCountByClass.get(c.id) ?? 0) === 0)

  type ClassRow = (typeof allClasses)[number]
  const classColumns: Column<ClassRow>[] = [
    {
      key: 'class',
      header: t('classes.class', lang),
      card: 'title',
      cell: (c) => (
        <div className="min-w-0">
          <Link
            href={withParams(tabParams, { view: c.id })}
            scroll={false}
            data-view-link={c.id}
            className="font-semibold hover:text-brand-600 hover:underline"
          >
            {c.name}
          </Link>
          <div className="text-xs text-muted">
            {[c.section && `${t('classes.section', lang)}: ${c.section}`, c.group_department].filter(Boolean).join(' · ') ||
              '—'}
          </div>
        </div>
      ),
    },
    { key: 'level', header: t('classes.educationLevel', lang), cell: (c) => c.education_level ?? dash },
    ...(configuredShifts.length > 0
      ? [{ key: 'shift', header: t('classes.shift', lang), cell: (c: ClassRow) => shiftLabel(c.shift) ?? dash }]
      : []),
    ...(showYearColumn
      ? [{ key: 'year', header: t('classes.academicYear', lang), cell: (c: ClassRow) => (c.academic_year != null ? formatNumber(c.academic_year, lang, { useGrouping: false }) : dash) }]
      : []),
    {
      key: 'teacher',
      header: t('classes.classTeacher', lang),
      cell: (c) => (
        <ClassTeacherPicker lang={lang} classId={c.id} teachers={teachers ?? []} current={c.class_teacher_id} />
      ),
    },
    {
      key: 'students',
      header: t('classes.students', lang),
      card: 'badge',
      cell: (c) => <Pill tone="brand">{fmt.format(countFor(counts, c.id))}</Pill>,
    },
  ]

  const subjectColumns: Column<SubjectListRow>[] = [
    {
      key: 'subject',
      header: t('classes.subject', lang),
      card: 'title',
      cell: (s) => (
        <div className="font-semibold">
          {s.name}
          {s.code ? <span className="font-normal text-muted"> ({s.code})</span> : null}
        </div>
      ),
    },
    {
      key: 'class',
      header: t('classes.class', lang),
      cell: (s) => {
        const cls = firstRelation(s.class_offerings)
        return cls ? classCatalogueLabel(cls, showYearColumn) : dash
      },
    },
    { key: 'theory', header: t('classes.theory', lang), cell: (s) => (s.theory_marks > 0 ? s.theory_marks : dash) },
    { key: 'mcq', header: t('classes.mcq', lang), cell: (s) => (s.mcq_marks > 0 ? s.mcq_marks : dash) },
    { key: 'practical', header: t('classes.practical', lang), cell: (s) => (s.practical_marks > 0 ? s.practical_marks : dash) },
    {
      key: 'papers',
      header: t('classes.multiPaper', lang),
      card: 'badge',
      cell: (s) =>
        s.paper_count > 1 ? (
          <Pill tone="sky">{`${s.paper_count} ${t('classes.papersWord', lang)}`}</Pill>
        ) : (
          <Pill tone="muted">{t('classes.singlePaper', lang)}</Pill>
        ),
    },
  ]

  const viewedClass = tab === 'classes' && view ? allClasses.find((c) => c.id === view) ?? null : null
  const viewedSubject = tab === 'subjects' && view ? subjectsInSelection.find((s) => s.id === view) ?? null : null
  const classPage = paginate(shownClasses, page, pageSize)
  const subjectPage = paginate(shownSubjects, page, pageSize)

  const detail = (rows: [string, React.ReactNode][]) => (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
  return (
    <>
      <PageHeader
        title={t('classes.title', lang)}
        subtitle={t('classes.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/classes', lang, { label: t('classes.title', lang) })}
        badge={`${fmt.format(allClasses.length)} ${t('classes.tabClasses', lang)} · ${fmt.format(subjectsInSelection.length)} ${t('classes.tabSubjects', lang)}`}
        actions={
          <>
            <Link href="/school/classes/archive" className={secondaryClass}>
              {t('classes.oldClasses', lang)}
            </Link>
            <Link href="/school/classes/syllabus" className={secondaryClass}>
              {t('classes.syllabus', lang)}
            </Link>
            {tab === 'subjects' ? (
              <AddSubjectModal
                lang={lang}
                classes={allClasses}
                showYear={showYearColumn}
                triggerLabel={t('classes.addSubject', lang)}
                triggerClassName={primaryClass}
                title={t('classes.addSubjectTitle', lang)}
              />
            ) : (
              <AddClassModal
                lang={lang}
                teachers={teachers ?? []}
                shiftChoices={shiftChoices}
                activeAcademicYear={activeAcademicYear}
                educationLevels={educationLevelOptions}
                groupDepartmentOptions={groupDepartmentOptions}
                triggerLabel={t('classes.addClass', lang)}
                triggerClassName={primaryClass}
                title={t('classes.addClassTitle', lang)}
              />
            )}
            <RowMenu
              label={t('students.more', lang)}
              items={[
                { label: t('classes.roomList', lang), href: '/school/institute/venues' },
                { label: t('classes.subjects', lang), href: '/school/students/subject-assignment' },
              ]}
            />
          </>
        }
      />

      {banner && (
        <WarningBanner
          label={t('classes.bannerWarn', lang)}
          text={banner.text}
          href={banner.href}
          linkLabel={t('classes.viewIncompleteList', lang)}
        />
      )}

      <StatGrid>
        <StatCard
          icon={<School className="size-5" />}
          label={t('classes.statClasses', lang)}
          value={fmt.format(allClasses.length)}
          note={`${fmt.format(levels.length)} ${t('classes.educationLevel', lang)}`}
          noteTone="muted"
        />
        <StatCard
          icon={<GraduationCap className="size-5" />}
          tone="mint"
          label={t('classes.statStudents', lang)}
          value={fmt.format(enrolledTotal)}
        />
        <StatCard
          icon={<BookOpen className="size-5" />}
          tone="sky"
          label={t('classes.statSubjects', lang)}
          value={fmt.format(subjectsInSelection.length)}
          note={noSubjects.length ? `${n(noSubjects.length)} ${t('classes.subjectsMissing', lang)}` : undefined}
          noteTone={noSubjects.length ? 'sun' : 'muted'}
          action={{ href: '/school/classes?tab=subjects', label: t('students.statView', lang) }}
        />
        <StatCard
          icon={<UserX className="size-5" />}
          tone={noTeacher.length ? 'sun' : 'muted'}
          label={t('classes.classTeacherMissing', lang)}
          value={fmt.format(noTeacher.length)}
          action={noTeacher.length ? { href: '/school/classes?teacher=missing', label: t('students.statView', lang) } : undefined}
        />
      </StatGrid>

      <SectionTabs
        label={t('classes.title', lang)}
        lang={lang}
        active={tab === 'subjects' ? '/school/classes?tab=subjects' : '/school/classes'}
        tabs={[
          { href: '/school/classes', labelKey: 'classes.tabClasses', count: allClasses.length },
          { href: '/school/classes?tab=subjects', labelKey: 'classes.tabSubjects', count: subjectsInSelection.length },
        ]}
      />

      {tab === 'classes' ? (
        <>
          {activeAcademicYear != null && copyClassesControlVisible(copySources) && (
            <div className="mb-grid">
              <CopyClassesControl lang={lang} activeYear={activeAcademicYear} sourceYears={copySources} />
            </div>
          )}
          <h2 className="mb-grid mt-section text-lg font-extrabold">{t('classes.classCatalogue', lang)}</h2>
          <DataTable
            rows={classPage.items}
            rowId={(c) => c.id}
            rowLabel={(c) => [c.name, c.section].filter(Boolean).join(' - ')}
            columns={classColumns}
            lang={lang}
            params={tabParams}
            caption={t('classes.classCatalogue', lang)}
            search={{ placeholder: t('classes.search', lang) }}
            filters={[
              {
                param: 'level',
                label: t('classes.educationLevel', lang),
                options: levels.map((l) => ({ value: l, label: l })),
              },
              ...(showYearColumn
                ? [
                    {
                      param: 'year',
                      label: t('classes.academicYear', lang),
                      // No `year` = the active year (issue #597); "All years" is explicit.
                      options: [
                        { value: 'all', label: t('classes.allYears', lang) },
                        ...yearOptions.map((y) => ({ value: String(y), label: String(y) })),
                      ],
                    },
                  ]
                : []),
            ]}
            chips={[
              {
                param: 'teacher',
                value: 'missing',
                label: `${t('classes.classTeacherMissing', lang)} (${fmt.format(noTeacher.length)})`,
              },
              {
                param: 'subjects',
                value: 'missing',
                label: `${t('classes.subjectsMissing', lang)} (${fmt.format(noSubjects.length)})`,
              },
            ]}
            rowActions={(c) => {
              const next = classNextStep(c)
              return <RowActionPill state="next" href={next.href} label={next.label} />
            }}
            rowMenu={(c) => [
              { label: t('classes.routine', lang), href: `/school/classes/routine?class=${c.id}` },
              { label: t('classes.syllabus', lang), href: '/school/classes/syllabus' },
              { label: t('classes.subjects', lang), href: `/school/students/subject-assignment?class=${c.id}` },
            ]}
            pagination={{ page: classPage.page, totalPages: classPage.totalPages, total: classPage.total, pageSize }}
            empty={
              allClasses.length ? (
                <EmptyState
                  title={t('classes.noMatch', lang)}
                  action={{ href: '/school/classes', label: t('students.clearFilters', lang) }}
                  lang={lang}
                />
              ) : (
                <EmptyState
                  title={t('classes.noClasses', lang)}
                  action={{ href: '/school/classes/archive', label: t('classes.oldClasses', lang) }}
                  lang={lang}
                />
              )
            }
          />
        </>
      ) : (
        <>
          {copySubjects.length > 0 && (
            <CopySubjectsBar
              lang={lang}
              selectedIds={copySubjects.map((s) => s.id)}
              sourceClassIds={copySubjects.map((s) => s.class_id).filter((id): id is string => id != null)}
              allClasses={allClasses}
              showYear={showYearColumn}
              cancelHref={`/school/classes${withParams(params, { copy: null })}`}
            />
          )}
          <h2 className="mb-grid mt-section text-lg font-extrabold">{t('classes.subjectList', lang)}</h2>
          <DataTable
            rows={subjectPage.items}
            rowId={(s) => s.id}
            rowLabel={(s) => s.name}
            columns={subjectColumns}
            lang={lang}
            params={tabParams}
            caption={t('classes.subjectList', lang)}
            search={{ placeholder: t('classes.searchSubjects', lang) }}
            filters={[{ param: 'subjectClass', label: t('classes.class', lang), options: subjectClassOptions }]}
            bulkActions={[{ label: t('classes.copySubjectsToClass', lang), action: stageSubjectCopy }]}
            rowActions={(s) => <ViewLink id={s.id} params={tabParams} label={t('table.profile', lang)} name={s.name} />}
            pagination={{ page: subjectPage.page, totalPages: subjectPage.totalPages, total: subjectPage.total, pageSize }}
            empty={
              subjectsInSelection.length ? (
                <EmptyState
                  title={t('classes.noMatch', lang)}
                  action={{ href: '/school/classes?tab=subjects', label: t('students.clearFilters', lang) }}
                  lang={lang}
                />
              ) : (
                <EmptyState
                  title={t('classes.noSubjects', lang)}
                  action={{ href: '/school/classes', label: t('classes.tabClasses', lang) }}
                  lang={lang}
                />
              )
            }
          />
        </>
      )}

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard
          icon={<UserCog className="size-5" />}
          title={t('classes.needsSetupTitle', lang)}
          tag={setupQueue.length ? t('classes.needsSetupTag', lang) : undefined}
        >
          {setupQueue.length ? (
            <ul className="mb-4 divide-y divide-line">
              {setupQueue.slice(0, 5).map((c) => {
                const hasTeacher = Boolean(c.class_teacher_id)
                const hasSubjects = (subjectCountByClass.get(c.id) ?? 0) > 0
                const next = classNextStep(c)
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{[c.name, c.section].filter(Boolean).join(' - ')}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Pill tone={hasTeacher ? 'mint' : 'muted'}>
                          {t(hasTeacher ? 'classes.teacherSet' : 'classes.classTeacherMissing', lang)}
                        </Pill>
                        <Pill tone={hasSubjects ? 'mint' : 'muted'}>
                          {t(hasSubjects ? 'classes.subjectsSet' : 'classes.subjectsMissing', lang)}
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
              <span
                className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600"
                aria-hidden
              >
                <UserCog className="size-6" />
              </span>
              <p className="font-bold">{t('classes.needsSetupEmpty', lang)}</p>
            </div>
          )}
        </WorkflowCard>

        <WorkflowCard
          icon={<CalendarClock className="size-5" />}
          title={t('classes.routineSetupTitle', lang)}
          tag={t('classes.routineSetupTag', lang)}
        >
          {noRoutine.length ? (
            <ul className="mb-4 divide-y divide-line">
              {noRoutine.slice(0, 5).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="truncate font-semibold">{[c.name, c.section].filter(Boolean).join(' - ')}</p>
                  <RowActionPill
                    state="next"
                    href={`/school/classes/routine?class=${c.id}`}
                    label={t('classes.setupRoutineAction', lang)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-4 text-center">
              <span
                className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600"
                aria-hidden
              >
                <ClipboardList className="size-6" />
              </span>
              <p className="font-bold">{t('classes.routineSetupEmpty', lang)}</p>
            </div>
          )}
          <p className="mb-4 rounded-xl bg-paper-muted p-4 text-sm text-muted">{t('classes.noRoutineNote', lang)}</p>
          <div className="mt-auto border-t border-line pt-4 text-center">
            <Link href="/school/classes/routine" className={primaryClass}>
              {t('classes.openRoutineBuilder', lang)}
            </Link>
          </div>
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewedClass || viewedSubject)}
        title={viewedClass?.name ?? viewedSubject?.name ?? ''}
        header={
          viewedClass ? (
            <DrawerHeader name={viewedClass.name} avatarId={viewedClass.id} subtitle={classCatalogueLabel(viewedClass, showYearColumn)} />
          ) : viewedSubject ? (
            <DrawerHeader name={viewedSubject.name} avatarId={viewedSubject.id} subtitle={viewedSubject.code ?? undefined} />
          ) : undefined
        }
        footer={
          viewedClass ? (
            <DrawerFooter
              cancelHref={classDrawerCancelHref(tabParams)}
              cancelLabel={t('routine.cancel', lang)}
              primary={{ href: classNextStep(viewedClass).href, label: classNextStep(viewedClass).label }}
            />
          ) : undefined
        }
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewedClass && (
          <ClassDrawerBody
            cls={viewedClass}
            studentCount={countFor(counts, viewedClass.id)}
            hasRoutine={routinedClassIds.has(viewedClass.id)}
            subjects={subjectsInSelection.filter((s) => s.class_id === viewedClass.id)}
            teachers={teachers ?? []}
            usedIds={usedIds}
            showYear={showYearColumn}
            lang={lang}
          />
        )}
        {viewedSubject && (
          <div className="grid gap-5">
            {detail([
              [
                t('classes.class', lang),
                (() => {
                  const cls = firstRelation(viewedSubject.class_offerings)
                  return cls ? classCatalogueLabel(cls, showYearColumn) : '—'
                })(),
              ],
              [t('classes.papers', lang), viewedSubject.paper_count],
              [t('classes.theory', lang), viewedSubject.theory_marks || '—'],
              [t('classes.mcq', lang), viewedSubject.mcq_marks || '—'],
              [t('classes.practical', lang), viewedSubject.practical_marks || '—'],
            ])}
            <div className="flex justify-end border-t border-line pt-4">
              <DeleteButton entity="subjects" id={viewedSubject.id} lang={lang} />
            </div>
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
