import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import {
  academicYearsOf,
  copyClassesControlVisible,
  copySourceYears,
  countFor,
  resolveYearFilter,
  showAcademicYearColumn,
  studentCounts,
  visibleClasses,
  yearFilterOptions,
} from '@/lib/classes'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { isKnownAcademicShift, ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import { AddClassForm, AddSubjectForm, CopyClassesControl, DeleteButton } from './class-controls'
import { ClassTeacherPicker } from './class-teacher-picker'
import { AddDetails } from '@/components/add-details'
import { selectClass } from '@/components/ui/field'

// Layout per ui/school-owner/classes-list.html: three anchored sections
// (Classes / Rooms / Subjects), each a toolbar + data table. Each class row
// links to its routine builder and the syllabus page (issue #45).

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; level?: string; year?: string }>
}) {
  const { q = '', level = '', year: yearParam } = await searchParams
  const lang: Lang = await currentLang()
  const {
    supabase,
    configuredShifts,
    shiftSelection,
    activeAcademicYear,
    startedAcademicYears,
    academicYearSelection,
  } = await getSchoolContext()

  // Choices for the create form are the current Global Shift Selection —
  // parseShiftSelection already guarantees every element is a member of
  // configured_shifts (#577), so no separate intersection is needed.
  const shiftChoices = shiftSelection.filter(isKnownAcademicShift)

  const [{ data: classes }, { data: subjects }, { data: enrollments }, { data: teachers }] = await Promise.all([
    applyGlobalYearFilterToOfferings(
      applyGlobalShiftFilterToOfferings(
        supabase
          .from('class_offerings')
          .select('id, name, section, education_level, group_department, class_teacher_id, shift, academic_year')
          .order('created_at'),
        shiftSelection,
      ),
      academicYearSelection,
    ),
    supabase
      .from('subjects')
      .select(
        'id, name, code, theory_marks, mcq_marks, practical_marks, paper_count, class_offerings(name, section)',
      )
      .order('created_at'),
    // ponytail: whole-table scan capped at 10k rows; switch to a count RPC
    // if a school ever outgrows it.
    supabase.from('student_enrollments').select('class_offering_id').is('closed_at', null).limit(10000),
    // Class teachers are Employees (#435). Archived staff are not offerable.
    // employee_card, not employees: 0136 gates the base table on the Employees
    // grant, and this picker belongs to Classes. A name is all it wants.
    supabase
      .from('employee_card')
      .select('id, full_name')
      .is('archived_at', null)
      .order('full_name'),
  ])

  const allClasses = classes ?? []
  const levels = [...new Set(allClasses.map((c) => c.education_level).filter(Boolean))] as string[]
  // Academic Year (issue #597): the list defaults to the School's active
  // Academic Year; every year the School has Offerings in stays selectable
  // (newest first), plus an "All years" option. The Year column shows only
  // when the full set spans more than one year.
  // The classes query is already narrowed to the Global Academic Year
  // Selection (candidate set), so `academicYearsOf(allClasses)` only ever names
  // years inside it — the per-page dropdown can only narrow *within* the global
  // set, never widen it (map #609, T5).
  const selectableYears = academicYearsOf(allClasses)
  const yearOptions = yearFilterOptions(selectableYears, activeAcademicYear)
  // The column + dropdown appear on the started-year history, not on inference
  // from the current Offering set — same boolean threaded into classCatalogueLabel.
  const showYearColumn = showAcademicYearColumn(startedAcademicYears)
  // A single-started-year School behaves exactly as it did pre-#597
  // (no column, no dropdown, no narrowing).
  const selectedYear = showYearColumn
    ? resolveYearFilter(yearParam, { activeYear: activeAcademicYear, presentYears: selectableYears })
    : null
  const yearFilterValue = selectedYear === null ? 'all' : String(selectedYear)
  const shownClasses = visibleClasses(allClasses, { q, level, year: selectedYear })
  const counts = studentCounts(enrollments ?? [])
  const dash = <span className="text-muted">—</span>

  // "Copy Classes from {year}" (map #609, T8): the source years are the School's
  // started years strictly before the active one, each counted from the Offering
  // set the page already holds — so a year currently deselected from the Global
  // Academic Year Selection is not offered as a source until it is reselected
  // (the copy_class_offerings_to_active_year RPC stays the authority regardless).
  const copySources = copySourceYears(
    startedAcademicYears,
    activeAcademicYear,
    (y) => allClasses.filter((c) => c.academic_year === y).length,
  )

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('classes.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      {/* Tabs (anchors, as in the mockup — all three sections on one page) */}
      <nav className="mb-5 flex gap-1 border-b border-line text-sm font-semibold">
        {(
          [
            ['#classes', 'classes.tabClasses'],
            ['#rooms', 'classes.tabRooms'],
            ['#subjects', 'classes.tabSubjects'],
          ] as const
        ).map(([href, key]) => (
          <a key={href} href={href} className="rounded-t-md px-4 py-2 text-muted hover:bg-paper hover:text-ink">
            {t(key, lang)}
          </a>
        ))}
      </nav>

      {/* Classes */}
      <section id="classes" className="mb-8 rounded-lg border border-line bg-paper p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Form className="flex flex-wrap items-center gap-2" action="/school/classes">
            <input
              name="q"
              defaultValue={q}
              placeholder={t('classes.search', lang)}
              className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
            />
            <select
              name="level"
              defaultValue={level}
              className={selectClass()}
            >
              <option value="">{t('classes.allLevels', lang)}</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {showYearColumn && (
              <select name="year" defaultValue={yearFilterValue} className={selectClass()}>
                <option value="all">{t('classes.allYears', lang)}</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('classes.filter', lang)}
            </button>
          </Form>
          <AddDetails label={t('classes.addClass', lang)}>
            <AddClassForm
              lang={lang}
              teachers={teachers ?? []}
              shiftChoices={shiftChoices}
              activeAcademicYear={activeAcademicYear}
            />
          </AddDetails>
        </div>
        {activeAcademicYear != null && copyClassesControlVisible(copySources) && (
          <div className="mb-4">
            <CopyClassesControl
              lang={lang}
              activeYear={activeAcademicYear}
              sourceYears={copySources}
            />
          </div>
        )}
        {!shownClasses.length ? (
          <p className="text-sm text-muted">{t('classes.noClasses', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('classes.class', lang)}</th>
                  <th className={thClass}>{t('classes.section', lang)}</th>
                  <th className={thClass}>{t('classes.educationLevel', lang)}</th>
                  <th className={thClass}>{t('classes.groupDept', lang)}</th>
                  {configuredShifts.length > 0 && <th className={thClass}>{t('classes.shift', lang)}</th>}
                  {showYearColumn && <th className={thClass}>{t('classes.academicYear', lang)}</th>}
                  <th className={thClass}>{t('classes.classTeacher', lang)}</th>
                  <th className={thClass}>{t('classes.students', lang)}</th>
                  <th className={thClass}>{t('classes.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {shownClasses.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{c.name}</td>
                    <td className={tdClass}>{c.section ?? dash}</td>
                    <td className={tdClass}>{c.education_level ?? dash}</td>
                    <td className={tdClass}>{c.group_department ?? dash}</td>
                    {configuredShifts.length > 0 && (
                      <td className={tdClass}>
                        {c.shift ? t(ACADEMIC_SHIFT_LABEL_KEY[c.shift as AcademicShift], lang) : dash}
                      </td>
                    )}
                    {showYearColumn && <td className={tdClass}>{c.academic_year ?? dash}</td>}
                    <td className={tdClass}>
                      <ClassTeacherPicker
                        lang={lang}
                        classId={c.id}
                        teachers={teachers ?? []}
                        current={c.class_teacher_id}
                      />
                    </td>
                    <td className={tdClass}>{countFor(counts, c.id)}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/school/classes/routine?class=${c.id}`}
                          className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                        >
                          {t('classes.routine', lang)}
                        </Link>
                        <Link
                          href="/school/classes/syllabus"
                          className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                        >
                          {t('classes.syllabus', lang)}
                        </Link>
                        <Link
                          href={`/school/students/subject-assignment?class=${c.id}`}
                          className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                        >
                          {t('classes.subjects', lang)}
                        </Link>
                        <DeleteButton entity="class_offerings" id={c.id} lang={lang} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Rooms moved to Institute Setup -> Venues (issue #93): rooms now belong
          to a building and are institute master data, not class configuration.
          The anchor and this link stay so existing navigation still lands. */}
      <section id="rooms" className="mb-8 rounded-lg border border-line bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{t('classes.roomList', lang)}</h2>
            <p className="mt-1 text-sm text-muted">{t('venues.movedHint', lang)}</p>
          </div>
          <Link
            href="/school/institute/venues"
            className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            {t('venues.manageLink', lang)}
          </Link>
        </div>
      </section>

      {/* Subjects */}
      <section id="subjects" className="rounded-lg border border-line bg-paper p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">{t('classes.subjectList', lang)}</h2>
          <AddDetails label={t('classes.addSubject', lang)}>
            <AddSubjectForm lang={lang} classes={classes ?? []} showYear={showYearColumn} />
          </AddDetails>
        </div>
        {!subjects?.length ? (
          <p className="text-sm text-muted">{t('classes.noSubjects', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('classes.subject', lang)}</th>
                  <th className={thClass}>{t('classes.class', lang)}</th>
                  <th className={thClass}>{t('classes.theory', lang)}</th>
                  <th className={thClass}>{t('classes.mcq', lang)}</th>
                  <th className={thClass}>{t('classes.practical', lang)}</th>
                  <th className={thClass}>{t('classes.multiPaper', lang)}</th>
                  <th className={thClass}>{t('classes.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const cls = s.class_offerings as unknown as { name: string; section: string | null } | null
                  return (
                    <tr key={s.id} className="border-b border-line">
                      <td className={`${tdClass} font-medium`}>
                        {s.name}
                        {s.code ? <span className="text-muted"> ({s.code})</span> : null}
                      </td>
                      <td className={tdClass}>
                        {cls ? `${cls.name}${cls.section ? ` — ${cls.section}` : ''}` : dash}
                      </td>
                      <td className={tdClass}>{s.theory_marks > 0 ? s.theory_marks : dash}</td>
                      <td className={tdClass}>{s.mcq_marks > 0 ? s.mcq_marks : dash}</td>
                      <td className={tdClass}>{s.practical_marks > 0 ? s.practical_marks : dash}</td>
                      <td className={tdClass}>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            s.paper_count > 1 ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
                          }`}
                        >
                          {s.paper_count > 1
                            ? `${s.paper_count} ${t('classes.papersWord', lang)}`
                            : t('classes.singlePaper', lang)}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <DeleteButton entity="subjects" id={s.id} lang={lang} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
