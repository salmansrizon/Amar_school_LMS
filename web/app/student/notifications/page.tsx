import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { NotificationInbox, type InboxRow } from '@/components/notification-inbox'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader } from '@/components/ui/page'

// The Student's own notification inbox.
//
// The shared /notifications page (#287) is deliberately shell-less so every role
// can use it, but reaching it from the bell dropped a Student out of their
// portal entirely — no sidebar, no nav, a different application mid-flow. This
// is the same inbox component inside the /student shell; RLS
// (recipient_id = auth.uid()) is what scopes the rows, here as there.
export const generateMetadata = pageTitle('shell.notifications')

export default async function StudentNotificationsPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('shell.notifications', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('shell.notifications', lang) }] }}
      />
      <Card>
        <NotificationInbox initial={(data as InboxRow[]) ?? []} lang={lang} />
      </Card>
    </main>
  )
}
