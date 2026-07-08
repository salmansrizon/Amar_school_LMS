import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { subscriptionStatus } from '@/lib/subscription'
import { createClient } from '@/lib/supabase/server'
import { SchoolSubscriptionControls } from './subscription-controls'

const STATUS_STYLE = {
  trial: 'bg-sky-soft text-sky-deep',
  active: 'bg-mint-soft text-mint-deep',
  expired: 'bg-alert-soft text-alert-deep',
} as const

export default async function SchoolsPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'super_admin') redirect('/super-admin')

  const [{ data: schools }, { data: redeemed }] = await Promise.all([
    supabase.from('schools').select('id, name, subscription_expires_at').order('name'),
    supabase.rpc('schools_with_code_history'),
  ])
  const withHistory = new Set((redeemed ?? []) as string[])
  const today = new Date(new Date().toISOString().slice(0, 10))

  const statusKey = { trial: 'schools.trial', active: 'schools.active', expired: 'schools.expired' } as const

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('schools.title', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('home.superAdmin', lang)}
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {schools?.map((s) => {
          const expiry = s.subscription_expires_at ? new Date(s.subscription_expires_at + 'T00:00:00Z') : null
          const status = subscriptionStatus(withHistory.has(s.id), expiry, today)
          return (
            <section key={s.id} className="rounded-lg border border-line bg-paper p-5 shadow-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{s.name}</h2>
                <span className="flex items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
                    {t(statusKey[status], lang)}
                  </span>
                  {s.subscription_expires_at && (
                    <span className="text-muted">
                      {t('schools.expiry', lang)}: {s.subscription_expires_at}
                    </span>
                  )}
                </span>
              </div>
              <SchoolSubscriptionControls
                schoolId={s.id}
                expiry={s.subscription_expires_at}
                status={status}
                lang={lang}
              />
            </section>
          )
        })}
      </div>
    </main>
  )
}
