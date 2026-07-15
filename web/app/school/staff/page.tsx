import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { CreateStaffForm } from './create-staff-form'

export default async function StaffPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner') redirect('/school')

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, created_at')
    .eq('role', 'staff_user')
    .order('created_at')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('staff.title', lang)}</h1>
        <Link href="/school" aria-label={t('denied.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('staff.create', lang)}</h2>
        <CreateStaffForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('staff.list', lang)}</h2>
        {!staff?.length && <p className="text-sm text-muted">{t('staff.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {staff?.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">{s.full_name ?? s.id}</span>
              <Link
                href={`/school/staff/${s.id}`}
                className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('staff.permissions', lang)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
