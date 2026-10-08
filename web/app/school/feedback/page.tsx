import { CheckCircle2, Mail, MessageSquare } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang, formatDate, formatDateTime } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { SectionTabs } from '@/components/ui/section-tabs'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { AddDetails } from '@/components/add-details'
import { LogFeedbackForm, FeedbackDetail } from './feedback-controls'
import { pageTitle } from '@/lib/page-title'

// Guardian feedback inbox (issue #38, PRD §5.9), on the DataTable (map 013
// FC4) with a drawer to read/reply. Hidden from the nav under #510 — reachable
// only by URL — so it still gets the kit's chrome in case an Owner opens it
// directly, but adds nothing to lib/school-nav.ts or the ⌘K palette.
//
// The reply/mark-read interaction is the one piece of client state on this
// page; it lives in feedback-controls.tsx's FeedbackDetail and calls the
// existing actions.ts server actions unchanged.

type Message = {
  id: string
  sender_name: string
  sender_role: string | null
  subject: string
  body: string
  status: 'unread' | 'read' | 'answered'
  reply_body: string | null
  replied_at: string | null
  created_at: string
}

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('feedback.title')

export default async function FeedbackInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', status = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase } = await getSchoolContext()

  const { data } = await supabase
    .from('feedback_messages')
    .select('id, sender_name, sender_role, subject, body, status, reply_body, replied_at, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const messages = (data ?? []) as Message[]
  const count = (s: Message['status']) => messages.filter((m) => m.status === s).length

  const needle = q.trim().toLowerCase()
  const shown = messages.filter(
    (m) =>
      (!status || m.status === status) &&
      (!needle || m.sender_name.toLowerCase().includes(needle) || m.subject.toLowerCase().includes(needle)),
  )
  const pageData = paginate(shown, page, pageSize)
  const viewed = view ? (messages.find((m) => m.id === view) ?? null) : null

  const statusTone = (s: Message['status']): 'sun' | 'mint' | 'muted' => (s === 'unread' ? 'sun' : s === 'answered' ? 'mint' : 'muted')
  const statusLabel = (s: Message['status']) =>
    t(s === 'unread' ? 'feedback.statusUnread' : s === 'answered' ? 'feedback.statusAnswered' : 'feedback.statusRead', lang)

  const columns: Column<Message>[] = [
    {
      key: 'sender',
      header: t('feedback.sender', lang),
      card: 'title',
      cell: (m) => (
        <div>
          <p className="font-semibold">{m.sender_name}</p>
          {m.sender_role && <p className="text-xs text-muted">{m.sender_role}</p>}
        </div>
      ),
    },
    { key: 'status', header: t('feedback.status', lang), card: 'badge', cell: (m) => <Pill tone={statusTone(m.status)}>{statusLabel(m.status)}</Pill> },
    {
      key: 'subject',
      header: t('feedback.subject', lang),
      className: 'max-w-sm',
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.subject}</p>
          <p className="truncate text-xs text-muted">{m.body}</p>
        </div>
      ),
    },
    { key: 'date', header: t('feedback.date', lang), cell: (m) => formatDate(m.created_at, lang) },
  ]

  return (
    <>
      <PageHeader
        title={t('feedback.title', lang)}
        crumbs={schoolCrumbs('/school/feedback', lang, [{ label: t('feedback.title', lang) }])}
        badge={`${t('pager.total', lang)}: ${fmt.format(messages.length)}`}
        actions={
          <AddDetails label={t('feedback.logNew', lang)}>
            <LogFeedbackForm lang={lang} />
          </AddDetails>
        }
      />

      <SectionTabs
        label={t('feedback.title', lang)}
        active="/school/feedback"
        lang={lang}
        tabs={[
          { href: '/school/feedback', labelKey: 'feedback.tabInbox' },
          { href: '/school/feedback/ratings', labelKey: 'feedback.tabRatings' },
        ]}
      />

      <StatGrid>
        <StatCard icon={<Mail className="size-5" />} tone="sun" label={t('feedback.statusUnread', lang)} value={fmt.format(count('unread'))} action={{ href: '/school/feedback?status=unread', label: t('feedback.view', lang) }} />
        <StatCard icon={<CheckCircle2 className="size-5" />} tone="mint" label={t('feedback.statusAnswered', lang)} value={fmt.format(count('answered'))} />
        <StatCard icon={<MessageSquare className="size-5" />} label={t('feedback.statTotal', lang)} value={fmt.format(messages.length)} />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(m) => m.id}
        rowLabel={(m) => `${m.sender_name}: ${m.subject}`}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('feedback.title', lang)}
        search={{ placeholder: t('feedback.search', lang) }}
        filters={[
          {
            param: 'status',
            label: t('feedback.status', lang),
            options: [
              { value: 'unread', label: t('feedback.statusUnread', lang) },
              { value: 'read', label: t('feedback.statusRead', lang) },
              { value: 'answered', label: t('feedback.statusAnswered', lang) },
            ],
          },
        ]}
        chips={[{ param: 'status', value: 'unread', label: t('feedback.statusUnread', lang) }]}
        rowActions={(m) => (
          <ViewLink id={m.id} params={params} label={m.status === 'answered' ? t('feedback.view', lang) : t('feedback.reply', lang)} name={`${m.sender_name}: ${m.subject}`} />
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">{t('feedback.none', lang)}</p>
          </Card>
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.subject ?? ''}
        subtitle={viewed ? [viewed.sender_name, viewed.sender_role].filter(Boolean).join(' · ') : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Pill tone={statusTone(viewed.status)}>{statusLabel(viewed.status)}</Pill>
              <span>{formatDateTime(viewed.created_at, lang)}</span>
            </div>
            <Card>
              <p className="whitespace-pre-wrap text-sm">{viewed.body}</p>
            </Card>
            <FeedbackDetail message={viewed} lang={lang} />
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
