import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { excludeArchivedOfferings } from '@/lib/school/archived-offerings-filter'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { isKnownAcademicShift } from '@/lib/institute'
import { CreateEmployeeForm } from './create-form'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { pageTitle } from '@/lib/page-title'

// Layout per ui/school-owner/employee-create-form.html: carded sections
// Identity / Bank Info / Category & Qualification / Subject & OfficeTime /
// Individual Grace Override, Cancel + Save at the bottom. OfficeTime assignment
// itself stays on the employee detail page (existing multi-officeTime toggles).
//
// Login + Class sections (issue #566) fold in what used to be the separate
// "Add a teacher" flow (#533) — both optional, same submit. The class list
// this page fetches is the same shape the now-deleted second entry point's
// page used to build.
export const generateMetadata = pageTitle('employees.createTitle')

export default async function NewEmployeePage() {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, configuredShifts, startedAcademicYears, academicYearSelection } =
    await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  // The Class Teacher picker never offers an archived Offering (ADR 0024).
  const { data: classes } = await applyGlobalYearFilterToOfferings(
    applyGlobalShiftFilterToOfferings(
      excludeArchivedOfferings(
        supabase
          .from('class_offerings')
          .select('id, name, section, group_department, class_teacher_id, shift, academic_year')
          .order('created_at'),
      ),
      shiftSelection,
    ),
    academicYearSelection,
  )

  const classOptions = (classes ?? []).map((c) => ({
    id: c.id,
    label: classCatalogueLabel(c, showYear),
    // A class that already has a teacher is still offered — reassignment is
    // legitimate — but the Owner is told, because silently replacing a class
    // teacher takes the previous one's students away without telling anybody.
    taken: c.class_teacher_id !== null,
  }))

  return (
    <div>
      <PageHeader
        title={t('employees.createTitle', lang)}
        backHref="/school/employees"
        backLabel={t('employees.title', lang)}
        crumbs={schoolCrumbs('/school/employees', lang, { label: t('employees.title', lang), href: '/school/employees' }, { label: t('employees.createTitle', lang) })}
      />
      <CreateEmployeeForm
        lang={lang}
        classes={classOptions}
        // #580: assignment-time choices come from configured_shifts, never
        // the Owner's own Global Shift Selection.
        shiftChoices={configuredShifts.filter(isKnownAcademicShift)}
      />
    </div>
  )
}
