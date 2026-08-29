import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { homeFor, type Role } from '@/lib/auth/routing'
import { NotificationInbox, type InboxRow } from '@/components/notification-inbox'

// Shared cross-role notifications inbox (#287). Any signed-in user sees their own
// notifications (recipient RLS). Standalone chrome (back to the caller's home) so
// it works for every role without a role-specific shell.
export default async function NotificationsInbox() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const home = homeFor((profile?.role ?? 'school_owner') as Role)

  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('shell.notifications', lang)}</h1>
        <Link href={home} className="text-sm text-brand-600 hover:underline">
          ← {t('dash.dashboard', lang)}
        </Link>
      </div>
      <NotificationInbox initial={(data as InboxRow[]) ?? []} lang={lang} />
    </main>
  )
}
