import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { countFor, studentCounts } from '@/lib/classes'
import { AddClassForm, AddRoomForm, AddSubjectForm, DeleteButton } from './class-controls'
import { AddDetails } from '@/components/add-details'

// Layout per ui/school-owner/classes-list.html: three anchored sections
// (Classes / Rooms / Subjects), each a toolbar + data table. Each class row
// links to its routine builder and the syllabus page (issue #45).

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; level?: string }>
}) {
  const { q = '', level = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: rooms }, { data: subjects }, { data: students }] =
    await Promise.all([
      supabase
        .from('classes')
        .select('id, name, section, education_level, group_department')
        .order('created_at'),
      supabase.from('rooms').select('id, name, capacity, is_active').order('created_at'),
      supabase
        .from('subjects')
        .select(
          'id, name, code, theory_marks, mcq_marks, practical_marks, paper_count, classes(name, section)',
        )
        .order('created_at'),
      // ponytail: whole-table scan capped at 10k rows; switch to a count RPC
      // if a school ever outgrows it.
      supabase.from('students').select('class_name, section').limit(10000),
    ])

  const levels = [...new Set((classes ?? []).map((c) => c.education_level).filter(Boolean))] as string[]
  const query = q.trim().toLowerCase()
  const visibleClasses = (classes ?? []).filter(
    (c) =>
      (!query || c.name.toLowerCase().includes(query)) &&
      (!level || c.education_level === level),
  )
  const counts = studentCounts(students ?? [])
  const dash = <span className="text-muted">—</span>

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('classes.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
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
      <section id="classes" className="mb-8 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder={t('classes.search', lang)}
              className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
            />
            <select
              name="level"
              defaultValue={level}
              className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">{t('classes.allLevels', lang)}</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('classes.filter', lang)}
            </button>
          </form>
          <AddDetails label={t('classes.addClass', lang)}>
            <AddClassForm lang={lang} />
          </AddDetails>
        </div>
        {!visibleClasses.length ? (
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
                  <th className={thClass}>{t('classes.students', lang)}</th>
                  <th className={thClass}>{t('classes.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{c.name}</td>
                    <td className={tdClass}>{c.section ?? dash}</td>
                    <td className={tdClass}>{c.education_level ?? dash}</td>
                    <td className={tdClass}>{c.group_department ?? dash}</td>
                    <td className={tdClass}>{countFor(counts, c.name, c.section)}</td>
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
                        <DeleteButton entity="classes" id={c.id} lang={lang} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Rooms */}
      <section id="rooms" className="mb-8 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">{t('classes.roomList', lang)}</h2>
          <AddDetails label={t('classes.addRoom', lang)}>
            <AddRoomForm lang={lang} />
          </AddDetails>
        </div>
        {!rooms?.length ? (
          <p className="text-sm text-muted">{t('classes.noRooms', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('classes.room', lang)}</th>
                  <th className={thClass}>{t('classes.capacity', lang)}</th>
                  <th className={thClass}>{t('classes.status', lang)}</th>
                  <th className={thClass}>{t('classes.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{r.name}</td>
                    <td className={tdClass}>{r.capacity}</td>
                    <td className={tdClass}>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.is_active ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
                        }`}
                      >
                        {t(r.is_active ? 'classes.active' : 'classes.inactive', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <DeleteButton entity="rooms" id={r.id} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Subjects */}
      <section id="subjects" className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">{t('classes.subjectList', lang)}</h2>
          <AddDetails label={t('classes.addSubject', lang)}>
            <AddSubjectForm lang={lang} classes={classes ?? []} />
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
                  const cls = s.classes as unknown as { name: string; section: string | null } | null
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
    </main>
  )
}
