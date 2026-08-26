import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { countFor, studentCounts } from '@/lib/classes'
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
  const { supabase } = await getSchoolContext()

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

  const [{ data: classes }, { data: students }, { data: tasks }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, section, group_department')
      .eq('class_teacher_id', myEmployeeId)
      .order('name'),
    // ponytail: whole-table scan capped at 10k rows, same as the classes page.
    supabase.from('students').select('class_name, section').limit(10000),
    supabase
      .from('publications')
      .select('id, title, due_at, target_class_name, target_section')
      .eq('kind', 'homework')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const counts = studentCounts(students ?? [])

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
                      {t('classes.students', lang)}: {countFor(counts, c.name, c.section)}
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
                  // Homework aimed at this class — a class-only target (no
                  // section) counts for every section, matching how the student
                  // side resolves the same targeting.
                  const mine = (tasks ?? []).filter(
                    (task) =>
                      task.target_class_name === c.name &&
                      (!task.target_section || task.target_section === (c.section ?? '')),
                  )
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
