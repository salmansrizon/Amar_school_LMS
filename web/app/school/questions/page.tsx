import Link from 'next/link'
import { Markdown } from '@/components/markdown'
import { markdownToPlainText } from '@/lib/rich-text'
import { CheckCircle2, Clock, MessageCircleQuestion, Tag } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, formatNumber, type Lang, formatDate, formatDateTime } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { groupByTopic, isAnswered, type InboxMessage } from '@/lib/student/messages'
import { hubSummary, answerableMessageIds } from '@/lib/student/hub-source'
import { waitingHours, waitingTone, WAITING_LATE_HOURS } from '@/lib/student/hub'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { withParams } from '@/lib/url-params'
import { HubTabs } from '../messages-hub-tabs'
import { ReplyForm } from './reply-form'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { QuestionDrawerBody, questionDrawerCancelHref } from './question-drawer'
import { pageTitle } from '@/lib/page-title'
import { loadExtraReplies, loadThreadIds } from '@/lib/student/questions-source'
import { threadSiblings } from '@/lib/student/question-threads'

// The Questions tab of বার্তা ও অনুরোধ (#454 inbox, #509 section), following
// the exam-landing pattern (013 FC4/013 A3): a one-line late-question warning
// banner, four stat cards, the DataTable (title opens the drawer, one
// contextual "Reply"/"View" pill per row — there is no second action to hide,
// so no ⋮), then two workflow cards — oldest-waiting questions and the topic
// queue.
//
// Grouping IS the feature. A flat chronological list would make a teacher sort
// twenty questions about the same task in their head, so the rows stay in topic
// order — the topic with the most unanswered questions first (groupByTopic) —
// with a Topic column and a Topic filter to narrow to one post. WHO sees which
// questions is not decided here — 0152 scopes the table itself, so this page
// issues one unscoped query and the database hands a Class Teacher her own
// classes and the Owner the school (ADR 0018).

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('hub.title')

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
  // #703 items 5.4 and 5.6, only for the question that is open. Both answer
  // "not available" until migrations 0253 / 0254 are applied: no earlier
  // messages are shown and no "add a reply" form is offered.
  const [furtherReplies, earlier] = viewed
    ? await Promise.all([
        loadExtraReplies(supabase, [viewed.id]),
        loadThreadIds(supabase).then((threadOf) => threadSiblings(messages, threadOf, viewed.id)),
      ])
    : [null, []]
  const lateList = messages.filter((m) => !isAnswered(m) && waitingHours(m) >= WAITING_LATE_HOURS)
  const late = lateList.length
  // Oldest-waiting-first — the ordering the workflow card needs, distinct from
  // the table's topic-grouped default order above.
  const oldestUnanswered = [...messages].filter((m) => !isAnswered(m)).sort((a, b) => waitingHours(b) - waitingHours(a))

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
      ? `${formatNumber(hours, lang)}${t('hub.answeredIn', lang)}`
      : m.reply_body
        ? t('questions.replied', lang)
        : hours < 1
          ? t('hub.freshlyAsked', lang)
          : `${formatNumber(hours, lang)}${t('hub.waitingHours', lang)}`
  }
  // The pill carries the waiting-age tone (no tone while fresh, sun past 24h,
  // alert past 72h, mint once answered), always paired with its text.
  const statusPill = (m: InboxMessage) => {
    return <Pill tone={waitingTone(m) ?? 'muted'}>{age(m)}</Pill>
  }
  const topicLabel = (m: InboxMessage) => (m.publication_id ? m.topic_label : `${m.topic_label} · ${t('questions.generalBucket', lang)}`)
  // The row's one contextual next step: Reply when unanswered and this viewer
  // may answer it (ADR 0018 scopes who), View otherwise — matching the
  // drawer's own ReplyForm/notYours split below.
  const nextStepFor = (m: InboxMessage): { state: 'next' | 'default'; label: string } =>
    !isAnswered(m) && (answerable === null || answerable.has(m.id))
      ? { state: 'next', label: t('questions.reply', lang) }
      : { state: 'default', label: t('notices.view', lang) }

  const columns: Column<InboxMessage>[] = [
    {
      key: 'student',
      header: t('questions.colStudent', lang),
      card: 'title',
      cell: (m) => (
        <div>
          <Link
            href={withParams(params, { view: m.id })}
            scroll={false}
            data-view-link={m.id}
            className="font-semibold hover:text-brand-600 hover:underline"
          >
            {m.student_name}
          </Link>
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
          <p className="truncate text-xs text-muted">{markdownToPlainText(m.body)}</p>
        </div>
      ),
    },
    { key: 'topic', header: t('questions.colTopic', lang), cell: topicLabel },
    {
      key: 'date',
      header: t('questions.colAsked', lang),
      cell: (m) => formatDate(m.created_at, lang),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('hub.title', lang)}
        subtitle={t('hub.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/questions', lang, [
          { label: t('hub.title', lang), href: '/school/questions' },
          { label: t('hub.tabQuestions', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(messages.length)}`}
      />
      <HubTabs active="/school/questions" lang={lang} summary={summary} />

      {late > 0 && (
        <WarningBanner
          label={t('questions.statLate', lang)}
          text={lateList
            .slice(0, 3)
            .map((m) => m.student_name)
            .join(', ')}
          href="/school/questions?state=unanswered"
          linkLabel={t('notices.view', lang)}
        />
      )}

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
        <StatCard
          icon={<Tag className="size-5" />}
          tone="sky"
          label={t('questions.statTopics', lang)}
          value={fmt.format(groups.length)}
          note={groups[0]?.unanswered ? groups[0].label : undefined}
          noteTone="muted"
        />
      </StatGrid>

      <h2 className="mb-grid mt-section text-lg font-extrabold">{t('hub.tabQuestions', lang)}</h2>
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
        rowActions={(m) => {
          const next = nextStepFor(m)
          return <RowActionPill state={next.state} href={withParams(params, { view: m.id })} label={next.label} />
        }}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">
              {summary.reachesAnyClass ? t('questions.none', lang) : t('hub.noClasses', lang)}
            </p>
          </Card>
        }
      />

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard icon={<Clock className="size-5" />} title={t('questions.workflowOldestTitle', lang)}>
          {oldestUnanswered.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('questions.workflowOldestEmpty', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {oldestUnanswered.slice(0, 5).map((m) => {
                const next = nextStepFor(m)
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.student_name}</p>
                      <p className="truncate text-xs text-muted">{m.subject}</p>
                    </div>
                    <RowActionPill state={next.state} href={withParams(params, { view: m.id })} label={next.label} />
                  </li>
                )
              })}
            </ul>
          )}
        </WorkflowCard>

        <WorkflowCard icon={<MessageCircleQuestion className="size-5" />} title={t('questions.colTopic', lang)}>
          <ul className="mb-4 divide-y divide-line">
            {groups.slice(0, 5).map((g) => (
              <li key={g.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p className="min-w-0 truncate font-semibold">
                  {g.label} · {fmt.format(g.messages.length)}
                </p>
                <RowActionPill
                  state={g.unanswered ? 'next' : 'default'}
                  href={withParams(params, { topic: g.key })}
                  label={t('notices.view', lang)}
                />
              </li>
            ))}
          </ul>
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.subject ?? ''}
        header={
          viewed && (
            <DrawerHeader
              name={viewed.student_name}
              avatarId={viewed.id}
              subtitle={[viewed.subject, who(viewed)].filter(Boolean).join(' · ')}
              status={statusPill(viewed)}
            />
          )
        }
        footer={viewed && <DrawerFooter cancelHref={questionDrawerCancelHref(params)} cancelLabel={t('routine.cancel', lang)} />}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <QuestionDrawerBody
            topic={topicLabel(viewed)}
            askedAt={formatDateTime(viewed.created_at, lang)}
            body={viewed.body}
            lang={lang}
            earlier={earlier.map((m) => ({
              id: m.id,
              href: withParams(params, { view: m.id }),
              askedAt: formatDateTime(m.created_at, lang),
              body: m.body,
            }))}
            replyArea={
              viewed.reply_body ? (
                <>
                  <div className="rounded-md bg-mint-soft p-3">
                    <span className="text-xs font-semibold text-mint-deep">{t('questions.replied', lang)}</span>
                    <Markdown className="mt-1" text={viewed.reply_body} />
                  </div>
                  {(furtherReplies ?? []).map((r) => (
                    <div key={r.id} className="rounded-md bg-mint-soft p-3">
                      <span className="text-xs font-semibold text-mint-deep">
                        {t('questions.replied', lang)} · <span className="text-muted">{formatDateTime(r.created_at, lang)}</span>
                      </span>
                      <Markdown className="mt-1" text={r.body} />
                    </div>
                  ))}
                  {furtherReplies !== null && (answerable === null || answerable.has(viewed.id)) && (
                    <ReplyForm lang={lang} messageId={viewed.id} further />
                  )}
                </>
              ) : answerable === null || answerable.has(viewed.id) ? (
                <ReplyForm lang={lang} messageId={viewed.id} />
              ) : (
                // Visible to him, not his to answer. Said once, here, rather than
                // after he has written a reply.
                <p className="text-xs italic text-muted">{t('questions.notYours', lang)}</p>
              )
            }
          />
        )}
      </RecordDrawer>
    </>
  )
}
