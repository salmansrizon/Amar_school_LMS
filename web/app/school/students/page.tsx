import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const lang = await currentLang()
  const showArchived = (await searchParams).archived === '1'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  let query = supabase
    .from('students')
    .select('id, full_name, class_name, section, roll_number, archived_at')
    .order('class_name', { nullsFirst: false })
    .order('roll_number', { nullsFirst: false })
  query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  const { data: students } = await query

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link
            href="/school/students"
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              !showArchived ? 'bg-brand-500 text-white' : 'border border-line-strong hover:bg-paper-muted'
            }`}
          >
            {t('students.showActive', lang)}
          </Link>
          <Link
            href="/school/students?archived=1"
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              showArchived ? 'bg-brand-500 text-white' : 'border border-line-strong hover:bg-paper-muted'
            }`}
          >
            {t('students.showArchived', lang)}
          </Link>
        </div>
        {!showArchived && (
          <Link
            href="/school/students/new"
            className="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            + {t('students.admit', lang)}
          </Link>
        )}
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!students?.length && <p className="text-sm text-muted">{t('students.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {students?.map((s) => (
            <li key={s.id}>
              <Link
                href={`/school/students/${s.id}`}
                className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand-600"
              >
                <span className="flex items-center gap-2">
                  {s.roll_number != null && (
                    <span className="inline-block min-w-8 rounded bg-paper-muted px-1.5 py-0.5 text-center text-xs font-semibold text-muted">
                      {s.roll_number}
                    </span>
                  )}
                  <span className="font-medium">{s.full_name}</span>
                </span>
                <span className="text-muted">{[s.class_name, s.section].filter(Boolean).join(' — ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
