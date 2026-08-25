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
  const { supabase, userId } = await getSchoolContext()

  const { data: me } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('profile_id', userId)
    .maybeSingle()

  if (!me) {
    return (
      <>
        <PageHeader title={t('myClasses.title', lang)} />
        <Card>
          <p className="text-sm text-muted">{t('myClasses.notLinked', lang)}</p>
        </Card>
      </>
    )
  }

  const [{ data: classes }, { data: students }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, section, group_department')
      .eq('class_teacher_id', me.id)
      .order('name'),
    // ponytail: whole-table scan capped at 10k rows, same as the classes page.
    supabase.from('students').select('class_name, section').limit(10000),
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
              <li key={c.id} className="flex items-center justify-between py-3">
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
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
