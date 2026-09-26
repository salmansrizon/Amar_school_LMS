import { CheckCircle2, Clock, MessageCircleQuestion } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { groupByTopic, isAnswered, type InboxMessage } from '@/lib/student/messages'
import { hubSummary, answerableMessageIds } from '@/lib/student/hub-source'
import { waitingHours, waitingTone, WAITING_LATE_HOURS } from '@/lib/student/hub'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { HubTabs } from '../messages-hub-tabs'
import { ReplyForm } from './reply-form'

// The Questions tab of বার্তা ও অনুরোধ (#454 inbox, #509 section), on the
// DataTable (map 013 FC4) with a drawer to read and answer.
//
// Grouping IS the feature. A flat chronological list would make a teacher sort
// twenty questions about the same task in their head, so the rows stay in topic
// order — the topic with the most unanswered questions first (groupByTopic) —
// with a Topic column and a Topic filter to narrow to one post. WHO sees which
// questions is not decided here — 0152 scopes the table itself, so this page
// issues one unscoped query and the database hands a Class Teacher her own
// classes and the Owner the school (ADR 0018).

const PAGE_SIZE = 20

export default async function SchoolQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; topic?: string; state?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', topic = '', state = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase } = await getSchoolContext()

  const { data } = await supabase
    .from('student_message_inbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  const messages = (data ?? []) as InboxMessage[]
  const groups = groupByTopic(messages)
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  // This page is already holding every row the questions badge would count, so
  // it counts them here and buys only the corrections query.
  //
  // `answerable` is one extra scan, not one call per row: a Subject Teacher sees
  // every question from the classes he teaches, and may answer only the ones
  // anchored to work he set (ADR 0018). Offering a reply box on the rest and
  // refusing after he has typed an answer is a bad way to teach that rule.
  const unansweredCount = messages.filter((m) => !isAnswered(m)).length
  const [summary, answerable] = await Promise.all([
    hubSummary(supabase, { skip: 'questions', known: unansweredCount }),
    answerableMessageIds(supabase),
  ])

  const ordered = groups.flatMap((g) => g.messages)
  const needle = q.trim().toLowerCase()
  const shown = ordered.filter(
    (m) =>
      (!topic || m.topic_key === topic) &&
      (!state || (state === 'answered') === isAnswered(m)) &&
      (!needle ||
        m.student_name.toLowerCase().includes(needle) ||
        m.subject.toLowerCase().includes(needle) ||
        m.body.toLowerCase().includes(needle)),
  )
  const pageData = paginate(shown, page, pageSize)
  const viewed = view ? (messages.find((m) => m.id === view) ?? null) : null
  const late = messages.filter((m) => !isAnswered(m) && waitingHours(m) >= WAITING_LATE_HOURS).length

  const who = (m: InboxMessage) =>
    [m.class_name && `${m.class_name}${m.section ? ` ${m.section}` : ''}`, m.roll_number !== null && `#${m.roll_number}`]
      .filter(Boolean)
      .join(' · ')
  // The elapsed figure is only a REPLY time when there is a replied_at to
  // measure to. A row with a reply body and no timestamp — 0148 allows it, and
  // the seed has some — would otherwise print its waiting time under the word
  // "answered".
  const age = (m: InboxMessage) => {
    const hours = waitingHours(m)
    return m.replied_at
      ? `${hours}${t('hub.answeredIn', lang)}`
      : m.reply_body
        ? t('questions.replied', lang)
        : hours < 1
          ? t('hub.freshlyAsked', lang)
          : `${hours}${t('hub.waitingHours', lang)}`
  }
  // The pill carries the waiting-age tone (no tone while fresh, sun past 24h,
  // alert past 72h, mint once answered), always paired with its text.
  const statusPill = (m: InboxMessage) => {
    return <Pill tone={waitingTone(m) ?? 'muted'}>{age(m)}</Pill>
  }
  const topicLabel = (m: InboxMessage) => (m.publication_id ? m.topic_label : `${m.topic_label} · ${t('questions.generalBucket', lang)}`)

  const columns: Column<InboxMessage>[] = [
    {
      key: 'student',
      header: t('questions.colStudent', lang),
      card: 'title',
      cell: (m) => (
        <div>
          <p className="font-semibold">{m.student_name}</p>
          <p className="text-xs text-muted">{who(m)}</p>
        </div>
      ),
    },
    { key: 'status', header: t('questions.colStatus', lang), card: 'badge', cell: statusPill },
    {
      key: 'question',
      header: t('questions.colQuestion', lang),
      className: 'max-w-sm',
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.subject}</p>
          <p className="truncate text-xs text-muted">{m.body}</p>
        </div>
      ),
    },
    { key: 'topic', header: t('questions.colTopic', lang), cell: topicLabel },
    {
      key: 'date',
      header: t('questions.colAsked', lang),
      cell: (m) => new Date(m.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('hub.title', lang)}
        crumbs={schoolCrumbs('/school/questions', lang, [
          { label: t('hub.title', lang), href: '/school/questions' },
          { label: t('hub.tabQuestions', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(messages.length)}`}
      />
      <HubTabs active="/school/questions" lang={lang} summary={summary} />

      <StatGrid>
        <StatCard
          icon={<MessageCircleQuestion className="size-5" />}
          tone="sun"
          label={t('questions.statUnanswered', lang)}
          value={fmt.format(unansweredCount)}
          action={{ href: '/school/questions?state=unanswered', label: t('notices.view', lang) }}
        />
        <StatCard
          icon={<Clock className="size-5" />}
          tone="alert"
          label={t('questions.statLate', lang)}
          value={fmt.format(late)}
        />
        <StatCard
          icon={<CheckCircle2 className="size-5" />}
          tone="mint"
          label={t('questions.statAnswered', lang)}
          value={fmt.format(messages.length - unansweredCount)}
        />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(m) => m.id}
        rowLabel={(m) => `${m.student_name}: ${m.subject}`}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('hub.tabQuestions', lang)}
        search={{ placeholder: t('questions.search', lang) }}
        filters={[
          {
            param: 'topic',
            label: t('questions.colTopic', lang),
            options: groups.map((g) => ({
              value: g.key,
              label: g.unanswered ? `${g.label} (${fmt.format(g.unanswered)})` : g.label,
            })),
          },
          {
            param: 'state',
            label: t('questions.colStatus', lang),
            options: [
              { value: 'unanswered', label: t('questions.unanswered', lang) },
              { value: 'answered', label: t('questions.replied', lang) },
            ],
          },
        ]}
        chips={[{ param: 'state', value: 'unanswered', label: t('questions.unanswered', lang) }]}
        rowActions={(m) => (
          <ViewLink
            id={m.id}
            params={params}
            label={isAnswered(m) ? t('notices.view', lang) : t('questions.reply', lang)}
            name={`${m.student_name}: ${m.subject}`}
          />
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">
              {summary.reachesAnyClass ? t('questions.none', lang) : t('hub.noClasses', lang)}
            </p>
          </Card>
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.subject ?? ''}
        subtitle={viewed ? [viewed.student_name, who(viewed)].filter(Boolean).join(' · ') : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {statusPill(viewed)}
              <span>{topicLabel(viewed)}</span>
              <span>· {new Date(viewed.created_at).toLocaleString(locale)}</span>
            </div>
            <Card>
              <p className="whitespace-pre-wrap text-sm">{viewed.body}</p>
            </Card>
            {viewed.reply_body ? (
              <div className="rounded-md bg-mint-soft p-3">
                <span className="text-xs font-semibold text-mint-deep">{t('questions.replied', lang)}</span>
                <p className="mt-1 whitespace-pre-wrap text-sm">{viewed.reply_body}</p>
              </div>
            ) : answerable === null || answerable.has(viewed.id) ? (
              <ReplyForm lang={lang} messageId={viewed.id} />
            ) : (
              // Visible to him, not his to answer. Said once, here, rather than
              // after he has written a reply.
              <p className="text-xs italic text-muted">{t('questions.notYours', lang)}</p>
            )}
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
