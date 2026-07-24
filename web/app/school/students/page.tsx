import Form from 'next/form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { filterStudents, behaviourAverages } from '@/lib/students'
import { selectClass } from '@/components/ui/field'

// Layout per ui/school-owner/students-list.html: search (name/roll/guardian) +
// class/section filters, table Roll | Name | Class/Section | Guardian |
// Behaviour Avg | Status | View, with Old Students + New Admission actions.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
function avgBadge(avg: number | undefined) {
  if (avg === undefined) return <span className="text-muted">—</span>
  const tone =
    avg >= 4 ? 'bg-mint-soft text-mint-deep' : avg >= 3 ? 'bg-sun-soft text-sun-deep' : 'bg-alert-soft text-alert-deep'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{avg}</span>
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; class?: string; section?: string }>
}) {
  const { q = '', class: klass = '', section = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: students }, { data: ratings }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, roll_number, class_name, section, guardian_name, archived_at')
      .is('archived_at', null)
      .order('class_name')
      .order('roll_number'),
    // ponytail: whole-table scan capped at 10k rows, mirrors the classes page.
    supabase.from('behaviour_log_entries').select('student_id, rating').limit(10000),
  ])

  const visible = filterStudents(students ?? [], q, klass, section)
  const avgs = behaviourAverages(ratings ?? [])
  const classNames = [...new Set((students ?? []).map((s) => s.class_name).filter(Boolean))] as string[]
  const sections = [
    ...new Set(
      (students ?? [])
        .filter((s) => !klass || s.class_name === klass)
        .map((s) => s.section)
        .filter(Boolean),
    ),
  ] as string[]

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.listTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Form className="flex flex-wrap items-center gap-2" action="/school/students">
          <input
            name="q"
            defaultValue={q}
            placeholder={t('students.search', lang)}
            className="w-56 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
          <select name="class" defaultValue={klass} className={selectClass()}>
            <option value="">{t('students.allClasses', lang)}</option>
            {classNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select name="section" defaultValue={section} className={selectClass()}>
            <option value="">{t('students.allSections', lang)}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </Form>
        <div className="flex gap-2">
          <Link
            href="/school/students/archive"
            className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.oldStudents', lang)}
          </Link>
          <Link
            href="/school/students/new"
            className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            + {t('students.newAdmission', lang)}
          </Link>
        </div>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!visible.length ? (
          <p className="text-sm text-muted">{t('students.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('students.roll', lang)}</th>
                  <th className={thClass}>{t('students.name', lang)}</th>
                  <th className={thClass}>{t('students.classSection', lang)}</th>
                  <th className={thClass}>{t('students.guardian', lang)}</th>
                  <th className={thClass}>{t('students.behaviourAvg', lang)}</th>
                  <th className={thClass}>{t('students.status', lang)}</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className="border-b border-line">
                    <td className={tdClass}>{s.roll_number ?? <span className="text-muted">—</span>}</td>
                    <td className={`${tdClass} font-medium`}>{s.full_name}</td>
                    <td className={tdClass}>
                      {[s.class_name, s.section].filter(Boolean).join(' / ') || (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={tdClass}>{s.guardian_name ?? <span className="text-muted">—</span>}</td>
                    <td className={tdClass}>{avgBadge(avgs.get(s.id))}</td>
                    <td className={tdClass}>
                      <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
                        {t('students.active', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Link href={`/school/students/${s.id}`} className="text-brand-600 hover:underline">
                        {t('students.view', lang)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
