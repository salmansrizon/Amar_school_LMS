import { currentLang } from '@/lib/i18n-server'
import Link from 'next/link'
import { t, formatDate, formatDateTime, formatNumber } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { AskForm } from './ask-form'
import { FollowUpForm } from './follow-up-form'
import { QuestionDialog } from './question-dialog'
import { MarkSeen, WithdrawQuestionButton } from './question-controls'
import { loadExtraReplies, loadOwnQuestions, loadSeenMarks } from '@/lib/student/questions-source'
import { isAnswered } from '@/lib/student/messages'
import { groupQuestions } from '@/lib/student/daily'
import { waitingTone } from '@/lib/student/hub'
import { buildConversations, findConversation, type Conversation } from '@/lib/student/question-threads'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader } from '@/components/ui/page'
import { ToneDot } from '@/components/ui/widgets'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { paginate, pageSizeFrom } from '@/components/pager'
import { withParams } from '@/lib/url-params'
import { Markdown } from '@/components/markdown'

// The Student's own questions (#454). The table groups a student's rows into
// conversations (lib/student/question-threads.ts), a row opens the conversation
// in a popup with ?view=<id> (?q=<id> still works), and the popup carries the
// follow-up composer. Search is ?find= because ?q= is the old open-question link.
export const generateMetadata = pageTitle('student.questionsTitle')

const PAGE_SIZE = 20

export default async function StudentQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; find?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const openId = params.view || params.q
  const lang = await currentLang()
  const ctx = await getStudentContext()

  // thread_id, further replies and seen marks arrive with migrations 0253-0255;
  // each read answers "not available" until then (lib/student/questions-source.ts).
  const [mine, extraReplies, seenMarks, { data: subjectRows }] = await Promise.all([
    loadOwnQuestions(ctx.supabase),
    loadExtraReplies(ctx.supabase),
    loadSeenMarks(ctx.supabase),
    // A general question must name a subject, and the anchor needs its id —
    // student_subject_option is the one place a Student may read that.
    ctx.supabase.from('student_subject_option').select('id, name').order('name'),
  ])

  // What each question was asked ABOUT.
  const anchorIds = [...new Set((mine ?? []).map((q) => q.publication_id).filter(Boolean))] as string[]
  const { data: anchors } = anchorIds.length
    ? await ctx.supabase.from('publications').select('id, title').in('id', anchorIds)
    : { data: [] as { id: string; title: string }[] }
  const anchorTitle = new Map((anchors ?? []).map((p) => [p.id, p.title]))
  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id, s.name]))
  const aboutOf = (q: { publication_id: string | null; subject_id: string | null }) =>
    (q.publication_id ? anchorTitle.get(q.publication_id) : null) ??
    (q.subject_id ? subjectName.get(q.subject_id) : null) ??
    null

  const now = new Date()
  const { waiting } = groupQuestions(mine ?? [])
  const readOnly = isReadOnly(ctx)

  const all = buildConversations(mine, extraReplies ?? [], seenMarks, now)
  const open = openId ? findConversation(all, openId) : null
  const needle = (params.find ?? '').trim().toLowerCase()
  const filtered = needle
    ? all.filter((c) => c.title.toLowerCase().includes(needle) || (aboutOf(c.first) ?? '').toLowerCase().includes(needle))
    : all
  const pageSize = pageSizeFrom(params.size, PAGE_SIZE)
  const pageData = paginate(filtered, params.page, pageSize)
  const closeHref = `/student/questions${withParams(params, { view: null, q: null })}`.replace(/\?$/, '')

  const toneOf = (c: Conversation) => waitingTone(c.last, now) ?? (c.answered ? 'mint' : 'sky')
  const statusOf = (c: Conversation) => (c.answered ? t('student.teacherReplied', lang) : t('student.awaitingReply', lang))
  const messageCount = (c: Conversation) => c.steps.filter((x) => x.kind !== 'waiting').length

  const columns: Column<Conversation>[] = [
    {
      key: 'title',
      header: t('student.questionSubject', lang),
      card: 'title',
      cell: (c) => (
        <Link
          href={withParams(params, { view: c.id, q: null })}
          scroll={false}
          data-view-link={c.id}
          aria-current={open?.id === c.id ? 'true' : undefined}
          className="block max-w-[22rem] truncate font-semibold hover:text-brand-600 hover:underline max-sm:-my-3 max-sm:py-3"
        >
          {c.title}
        </Link>
      ),
    },
    { key: 'about', header: t('student.questionAbout', lang), cell: (c) => aboutOf(c.first) ?? <span className="text-muted">—</span> },
    { key: 'date', header: t('student.lastActivity', lang), cell: (c) => <span className="text-muted">{formatDate(c.lastActivity, lang)}</span> },
    {
      key: 'status',
      header: t('questions.colStatus', lang),
      card: 'badge',
      cell: (c) => (
        <span className="inline-flex items-center gap-2 text-xs font-semibold">
          <ToneDot tone={toneOf(c)} />
          {statusOf(c)}
          {c.newReply && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              {t('student.newReply', lang)}
            </span>
          )}
        </span>
      ),
    },
    { key: 'count', header: t('student.messagesCount', lang), cell: (c) => formatNumber(messageCount(c), lang) },
  ]

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        icon="questions"
        title={t('student.questionsTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.navGroup.study', lang) }] }}
        badge={waiting.length ? `${formatNumber(waiting.length, lang)} ${t('student.questionsWaitingBadge', lang)}` : undefined}
      />
      <SectionTabs
        tabs={studentGroupTabs('study', { questions: waiting.length })}
        active="/student/questions"
        lang={lang}
        label={t('student.navGroup.study', lang)}
      />

      {!readOnly && (
        <div id="ask" className="mb-section scroll-mt-24">
          <Card>
            <h2 className="mb-3 font-bold">{t('student.askGeneral', lang)}</h2>
            <AskForm lang={lang} subjects={subjectRows ?? []} />
          </Card>
        </div>
      )}

      <DataTable
        rows={pageData.items}
        rowId={(c) => c.id}
        rowLabel={(c) => c.title}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('student.questionsTitle', lang)}
        search={{ param: 'find', placeholder: t('student.questionsSearch', lang) }}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          needle ? (
            <EmptyState
              icon="questions"
              lang={lang}
              title={t('search.noResults', lang)}
              action={{ href: withParams(params, { find: null, view: null, q: null }), label: t('table.resetFilters', lang) }}
            />
          ) : (
            <EmptyState
              icon="questions"
              lang={lang}
              title={t('student.noQuestions', lang)}
              body={t('student.noQuestionsHint', lang)}
              action={{ href: '/student/notices', label: t('student.nav.notices', lang) }}
            />
          )
        }
      />

      {open && (
        <QuestionDialog lang={lang} title={open.title} about={aboutOf(open.first)} closeHref={closeHref} focusId={open.id}>
          {/* The sequence, oldest first: asked, replied, asked again, … then the wait. */}
          <ol className="ui-stagger relative ml-1 space-y-5 border-l-2 border-line pl-5">
            {open.steps.map((step, i) => (
              <li key={`${step.rowId}-${step.kind}-${i}`} className="relative">
                <span className="absolute -left-[26px] top-1">
                  {step.kind === 'asked' ? (
                    <ToneDot tone="brand" />
                  ) : step.kind === 'replied' ? (
                    <ToneDot tone="mint" />
                  ) : (
                    <ToneDot tone={waitingTone(open.last, now) ?? 'sky'} pulse />
                  )}
                </span>
                {step.kind === 'asked' && (
                  <>
                    <p className="text-xs font-semibold text-brand-600">
                      {t('student.questionBody', lang)} · <span className="text-muted">{formatDateTime(step.at, lang)}</span>
                    </p>
                    <Markdown className="mt-1" text={step.body} />
                  </>
                )}
                {step.kind === 'replied' && (
                  <>
                    <p className="text-xs font-semibold text-mint-deep">
                      {t('student.teacherReplied', lang)}
                      {step.at && (
                        <>
                          {' · '}
                          <span className="text-muted">{formatDateTime(step.at, lang)}</span>
                        </>
                      )}
                    </p>
                    <Markdown className="mt-1 rounded-md bg-mint-soft p-3" text={step.body} />
                  </>
                )}
                {step.kind === 'waiting' && <p className="text-xs font-semibold text-muted">{t('student.awaitingReply', lang)}</p>}
              </li>
            ))}
          </ol>
          {!readOnly && <MarkSeen ids={open.repliedRowIds} />}
          {!readOnly && (
            <div className="mt-6 border-t border-line pt-4">
              <FollowUpForm
                lang={lang}
                title={open.first.subject}
                publicationId={open.first.publication_id}
                subjectId={open.first.subject_id}
                threadId={open.first.id}
              />
              {/* #703 item 5.8: the latest message can be withdrawn while nobody has replied to it. */}
              {!isAnswered(open.last) && !open.last.reply_body && (
                <div className="mt-4">
                  <WithdrawQuestionButton id={open.last.id} lang={lang} closeHref={closeHref} />
                </div>
              )}
            </div>
          )}
        </QuestionDialog>
      )}
    </main>
  )
}
