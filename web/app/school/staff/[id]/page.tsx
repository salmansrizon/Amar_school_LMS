import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { GRANTABLE_SCREENS } from '@/lib/auth/screens'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { ScreenToggle } from './screen-toggle'

export default async function StaffPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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
    .select('id, full_name, role')
    .eq('id', id)
    .eq('role', 'staff_user')
    .single()
  if (!staff) notFound()

  const { data: grants } = await supabase
    .from('staff_permissions')
    .select('screen_key')
    .eq('staff_user_id', id)
  const granted = new Set((grants ?? []).map((g) => g.screen_key))

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">
          {t('staff.screens', lang)} — {staff.full_name}
        </h1>
        <Link href="/school/staff" aria-label={t('staff.list', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <ul className="divide-y divide-line">
          {GRANTABLE_SCREENS.map((screen) => (
            <li key={screen.key} className="flex items-center justify-between py-2.5">
              <span className="text-sm font-medium">{screen.label[lang]}</span>
              <ScreenToggle
                staffUserId={staff.id}
                screenKey={screen.key}
                granted={granted.has(screen.key)}
                grantedLabel={t('staff.granted', lang)}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
