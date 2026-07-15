import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { LogFeedbackForm, FeedbackRow } from './feedback-controls'
import { AddDetails } from '@/components/add-details'

// Layout per ui/school-owner/feedback-inbox.html: tabs (Inbox / Ratings
// Dashboard), a search+status toolbar, and a data table with an expandable
// reply row per message (issue #38).

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'

export default async function FeedbackInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q = '', status = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: messages } = await supabase
    .from('feedback_messages')
    .select('id, sender_name, sender_role, subject, body, status, reply_body, replied_at, created_at')
    .order('created_at', { ascending: false })

  const query = q.trim().toLowerCase()
  const visible = (messages ?? []).filter(
    (m) =>
      (!query ||
        m.sender_name.toLowerCase().includes(query) ||
        m.subject.toLowerCase().includes(query)) &&
      (!status || m.status === status),
  )

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('feedback.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <nav className="mb-5 flex gap-1 border-b border-line text-sm font-semibold">
        <span className="rounded-t-md bg-paper px-4 py-2 text-ink">{t('feedback.tabInbox', lang)}</span>
        <Link href="/school/feedback/ratings" className="rounded-t-md px-4 py-2 text-muted hover:bg-paper hover:text-ink">
          {t('feedback.tabRatings', lang)}
        </Link>
      </nav>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder={t('feedback.search', lang)}
              className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
            />
            <select
              name="status"
              defaultValue={status}
              className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">{t('feedback.allStatus', lang)}</option>
              <option value="unread">{t('feedback.statusUnread', lang)}</option>
              <option value="read">{t('feedback.statusRead', lang)}</option>
              <option value="answered">{t('feedback.statusAnswered', lang)}</option>
            </select>
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('feedback.filter', lang)}
            </button>
          </form>
          <AddDetails label={t('feedback.logNew', lang)}>
            <LogFeedbackForm lang={lang} />
          </AddDetails>
        </div>

        {!visible.length ? (
          <p className="text-sm text-muted">{t('feedback.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('feedback.sender', lang)}</th>
                  <th className={thClass}>{t('feedback.subject', lang)}</th>
                  <th className={thClass}>{t('feedback.date', lang)}</th>
                  <th className={thClass}>{t('feedback.status', lang)}</th>
                  <th className={thClass}>{t('feedback.action', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <FeedbackRow key={m.id} message={m} lang={lang} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
