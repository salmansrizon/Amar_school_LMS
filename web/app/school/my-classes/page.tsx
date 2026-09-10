import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { countFor, homeworkTargetsOffering, studentCounts } from '@/lib/classes'
import { Card, PageHeader } from '@/components/ui/page'

// The Class Teacher's own view (#443): the classes they are responsible for.
//
// No staff_permissions screen key, deliberately. Being the class teacher IS the
// authorization — a key would mean an owner has to both assign the teacher and
// then remember to grant them a screen, and the page is self-scoping: it shows
// the caller's own classes and nothing else. screenKeyForPath returns null for
// this route, so the proxy leaves it alone.

export default async function MyClassesPage() {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection } = await getSchoolContext()

  // Asked as a scalar, not by reading `employees`: that table is gated on the
  // Employees screen grant (0136), which a Class Teacher rarely holds, and a
  // teacher must always be able to find out which Employee they themselves are.
  const { data: myEmployeeId } = await supabase.rpc('app_current_employee_id')

  if (!myEmployeeId) {
    return (
      <>
        <PageHeader title={t('myClasses.title', lang)} />
        <Card>
          <p className="text-sm text-muted">{t('myClasses.notLinked', lang)}</p>
        </Card>
      </>
    )
  }

  const [{ data: classes }, { data: enrollments }, { data: tasks }] = await Promise.all([
    // The Global Shift filter applies (a browse view), but the Global Academic
    // Year Selection deliberately does NOT (map #609, T6/#615): Homework
    // authoring is a compose/targeting surface, and `homeworkTargetsOffering`
    // resolves against `active_academic_year` by business rule. A wider
    // "visible years" set must never change which classes a teacher can assign
    // homework to.
    applyGlobalShiftFilterToOfferings(
      supabase
        .from('class_offerings')
        .select('id, name, section, group_department, shift, academic_year')
        .eq('class_teacher_id', myEmployeeId)
        .order('name'),
      shiftSelection,
    ),
    // ponytail: whole-table scan capped at 10k rows, same as the classes page.
    supabase.from('student_enrollments').select('class_offering_id').is('closed_at', null).limit(10000),
    // Offering-aware since map #598 Wave 4 (#605); target_scope is the sole
    // targeting discriminator as of Wave 7 (#608) -- homeworkTargetsOffering
    // resolves every row through the shared predicate.
    supabase
      .from('publications')
      .select(
        'id, title, due_at, target_scope, class_offering_id, target_class_name, target_academic_year, target_shift, target_group_department, target_section',
      )
      .eq('kind', 'homework')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const counts = studentCounts(enrollments ?? [])

  return (
    <>
      <PageHeader title={t('myClasses.title', lang)} />
      <Card>
        {!classes?.length ? (
          <p className="text-sm text-muted">{t('myClasses.none', lang)}</p>
        ) : (
          <ul className="divide-y divide-line">
            {classes.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{classCatalogueLabel(c)}</span>
                  <span className="flex items-center gap-4 text-sm text-muted">
                    <span>
                      {t('classes.students', lang)}: {countFor(counts, c.id)}
                    </span>
                    <Link
                      href={`/school/classes/routine?class=${c.id}`}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                    >
                      {t('classes.routine', lang)}
                    </Link>
                  </span>
                </div>
                {(() => {
                  // Homework aimed at this class: a school-wide (scope='all')
                  // target always counts, and a broadcast target with an Any
                  // dimension counts for every value of it — the shared
                  // Notices/SMS targeting rule.
                  const mine = (tasks ?? []).filter((task) => homeworkTargetsOffering(task, c))
                  if (!mine.length) return null
                  return (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {mine.map((task) => (
                        <li key={task.id}>
                          <Link
                            href={`/school/my-classes/tasks/${task.id}`}
                            className="rounded-full bg-paper-muted px-3 py-1 text-xs hover:bg-brand-50"
                          >
                            {t('myClasses.homework', lang)}: {task.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )
                })()}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
