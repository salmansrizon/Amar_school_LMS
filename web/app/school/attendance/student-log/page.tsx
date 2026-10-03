import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, formatNumber } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { AttendanceTabs } from '../attendance-tabs'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable } from '@/components/data-table/data-table'
import { filterButtonClass } from '@/components/ui/field'
import { pageTitle } from '@/lib/page-title'

// Student Log finder (map #380, docs/011_student_module.md): Class -> Section
// picker + roll-sorted roster, each row opening that student's attendance
// history. Same class/section Form pattern as mark/page.tsx and
// book/page.tsx; filterRoster does the sort (roll number, unrolled students
// falling back to name) so this page adds no new ordering logic.


export const generateMetadata = pageTitle('attendance.studentLogTitle')

export default async function StudentLogPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { classSection = '' } = params
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  // The roster model owns the fetch, the class filter and the register sort.
  const { combos, students: visible } = await schoolRoster(supabase, {
    classSection,
    shiftSelection,
    showYear,
    academicYearSelection,
  })

  // Forwards the already-picked Class Offering id straight through (map
  // #568/#582, Wave 4a Part B) — no more encode/decode round-trip through a
  // class/section text pair, and the detail page no longer needs its own
  // class_offerings fetch just to rebuild this id via findClassCatalogueId.
  const pageSize = pageSizeFrom(params.size, 50)
  const paged = paginate(visible, params.page, pageSize)

  const viewLogHref = (studentId: string) =>
    `/school/attendance/student-log/${studentId}${classSection ? `?classSection=${encodeURIComponent(classSection)}` : ''}`

  return (
    <div>
      <PageHeader
        title={t('attendance.studentLogTitle', lang)}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang), href: '/school/attendance' }, { label: t('attendance.studentLogTitle', lang) })}
      />

      <AttendanceTabs active="/school/attendance/student-log" lang={lang} />

      <Form className="mb-4 grid gap-3 rounded-2xl border border-line bg-paper p-card sm:grid-cols-2" action="/school/attendance/student-log">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
          <ClassSectionSelect
            combos={combos}
            value={classSection}
            ariaLabel={t('attendance.classSection', lang)}
            allLabel={t('attendance.allClasses', lang)}
            fullWidth
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className={filterButtonClass({ fullWidth: true })}
          >
            {t('classes.filter', lang)}
          </button>
        </div>
      </Form>

      <DataTable
        rows={paged.items}
        rowId={(s) => s.id}
        rowLabel={(s) => s.full_name}
        columns={[
          { key: 'roll', header: t('attendance.rollCol', lang), cell: (s) => s.roll_number != null ? formatNumber(s.roll_number, lang) : '—' },
          { key: 'name', header: t('attendance.nameCol', lang), card: 'title', cell: (s) => <span className="font-semibold">{s.full_name}</span> },
          { key: 'class', header: t('attendance.class', lang), cell: (s) => s.class_name ?? '—' },
          { key: 'section', header: t('attendance.section', lang), cell: (s) => s.section ?? '—' },
        ]}
        lang={lang}
        params={params}
        caption={t('attendance.studentLogTitle', lang)}
        rowActions={(s) => (
          <Link
            href={viewLogHref(s.id)}
            className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('attendance.viewLog', lang)}
          </Link>
        )}
        pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize }}
        empty={<EmptyState title={t('attendance.none', lang)} action={{ href: '/school/attendance/student-log', label: t('students.clearFilters', lang) }} lang={lang} />}
      />
    </div>
  )
}
