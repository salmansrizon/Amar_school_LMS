import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddClassForm, AddRoomForm, AddSubjectForm, DeleteButton } from './class-controls'

export default async function ClassesPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: rooms }, { data: subjects }] = await Promise.all([
    supabase.from('classes').select('id, name, section, education_level, group_department').order('created_at'),
    supabase.from('rooms').select('id, name, capacity').order('created_at'),
    supabase
      .from('subjects')
      .select('id, name, code, theory_marks, mcq_marks, practical_marks, paper_count')
      .order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('classes.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      {/* Classes */}
      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('classes.tabClasses', lang)}</h2>
        <AddClassForm lang={lang} />
        {!classes?.length ? (
          <p className="mt-4 text-sm text-muted">{t('classes.noClasses', lang)}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.section ? <span className="text-muted"> · {c.section}</span> : null}
                  {c.education_level ? <span className="text-muted"> · {c.education_level}</span> : null}
                  {c.group_department ? <span className="text-muted"> · {c.group_department}</span> : null}
                </span>
                <DeleteButton entity="classes" id={c.id} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rooms */}
      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('classes.tabRooms', lang)}</h2>
        <AddRoomForm lang={lang} />
        {!rooms?.length ? (
          <p className="mt-4 text-sm text-muted">{t('classes.noRooms', lang)}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {rooms.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted"> · {t('classes.capacity', lang)}: {r.capacity}</span>
                </span>
                <DeleteButton entity="rooms" id={r.id} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Subjects */}
      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('classes.tabSubjects', lang)}</h2>
        <AddSubjectForm lang={lang} />
        {!subjects?.length ? (
          <p className="mt-4 text-sm text-muted">{t('classes.noSubjects', lang)}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {subjects.map((sub) => {
              const total = sub.theory_marks + sub.mcq_marks + sub.practical_marks
              return (
                <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-sm">
                    <span className="font-medium">{sub.name}</span>
                    {sub.code ? <span className="text-muted"> ({sub.code})</span> : null}
                    <span className="text-muted">
                      {' · '}
                      {t('classes.theory', lang)} {sub.theory_marks} / {t('classes.mcq', lang)} {sub.mcq_marks} /{' '}
                      {t('classes.practical', lang)} {sub.practical_marks} · {t('classes.total', lang)} {total} ·{' '}
                      {sub.paper_count} {t('classes.papers', lang)}
                    </span>
                  </span>
                  <DeleteButton entity="subjects" id={sub.id} lang={lang} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
