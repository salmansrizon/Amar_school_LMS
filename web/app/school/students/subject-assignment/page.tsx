import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { excludeArchivedOfferings } from '@/lib/school/archived-offerings-filter'
import { subjectsForClass } from '@/lib/students'
import { ClassPicker } from '../../classes/routine/routine-cell'
import { BulkAssignForm } from './bulk-assign-form'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { pageTitle } from '@/lib/page-title'

// Bulk "assign all" per class (issue #46, PRD §5.1 second half): pick a class,
// check which subjects apply and which of those are optional, assign to every
// student in that class. Per-student overrides live on the student detail page.

export const generateMetadata = pageTitle('subjects.title')

export default async function SubjectAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  const { class: selectedClass = '' } = await searchParams
  // The Class picker never offers an archived Offering (ADR 0024) — a
  // deep-linked archived class still resolves below (the point lookup by id
  // is unfiltered), since bulk-assigning is one thing, but a stale link
  // shouldn't 404 outright.
  const { data: classes } = await applyGlobalYearFilterToOfferings(
    applyGlobalShiftFilterToOfferings(
      excludeArchivedOfferings(
        supabase.from('class_offerings').select('id, name, section, shift, academic_year').order('created_at'),
      ),
      shiftSelection,
    ),
    academicYearSelection,
  )

  return (
    <div>
      <PageHeader
        title={t('subjects.title', lang)}
        backHref="/school/classes"
        backLabel={t('classes.title', lang)}
        crumbs={schoolCrumbs('/school/students', lang, { label: t('students.listTitle', lang), href: '/school/students' }, { label: t('subjects.title', lang) })}
      />

      {!classes?.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">
          {t('routine.noClasses', lang)}
        </p>
      ) : (
        <>
          <div className="mb-4">
            <ClassPicker
              classes={classes}
              selected={selectedClass}
              lang={lang}
              basePath="/school/students/subject-assignment"
              pickLabelKey="subjects.pickClass"
              showYear={showYear}
            />
          </div>
          {selectedClass ? (
            <AssignmentPanel classId={selectedClass} lang={lang} />
          ) : (
            <p className="text-sm text-muted">{t('subjects.pickClass', lang)}</p>
          )}
        </>
      )}
    </div>
  )
}

async function AssignmentPanel({ classId, lang }: { classId: string; lang: Lang }) {
  const { supabase } = await getSchoolContext()
  const { data: cls } = await supabase.from('class_offerings').select('id').eq('id', classId).maybeSingle()
  if (!cls) return <p className="text-sm text-alert-deep">{t('subjects.classNotFound', lang)}</p>

  const [{ data: subjects }, studentCountRes] = await Promise.all([
    supabase.from('subjects').select('id, name, class_id'),
    supabase
      .from('student_enrollments')
      .select('student_id', { count: 'exact', head: true })
      .eq('class_offering_id', classId)
      .is('closed_at', null),
  ])

  const available = subjectsForClass(subjects ?? [], classId)
  return (
    <BulkAssignForm
      classId={classId}
      subjects={available}
      studentCount={studentCountRes.count ?? 0}
      lang={lang}
    />
  )
}
