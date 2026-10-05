import { currentLang } from '@/lib/i18n-server'
import Link from 'next/link'
import { t, formatDate, formatDateTime, formatNumber } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { AskForm } from './ask-form'
import { groupQuestions } from '@/lib/student/daily'
import { waitingTone } from '@/lib/student/hub'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader, TableFrame, railClass, tdClass, thClass, trClass } from '@/components/ui/page'
import { ToneDot } from '@/components/ui/widgets'
import { isAnswered } from '@/lib/student/messages'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

// The Student's own questions (#454). One question, one reply — not a thread.
// Ask on top, the questions as a table, and one question's timeline (asked,
// then answered or still waiting) opened from its row with ?q=<id>.
export const generateMetadata = pageTitle('student.questionsTitle')

export default async function StudentQuestionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: openId } = await searchParams
  const lang = await currentLang()
  const ctx = await getStudentContext()

  const [{ data: mine }, { data: subjectRows }] = await Promise.all([
    ctx.supabase
      .from('student_messages')
      .select('id, subject, body, status, reply_body, replied_at, created_at, publication_id, subject_id')
      .order('created_at', { ascending: false }),
    // A general question must name a subject, and the anchor needs its id —
    // student_subject_option is the one place a Student may read that.
    ctx.supabase.from('student_subject_option').select('id, name').order('name'),
  ])

  // What each question was asked ABOUT. The teacher's inbox groups by this, and
  // the student's own list dropped it entirely — a question asked from a notice
  // arrived here with no trace of the notice.
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
  const { waiting, answered } = groupQuestions(mine ?? [])
  const readOnly = isReadOnly(ctx)

  type Question = NonNullable<typeof mine>[number]
  // Waiting first, then answered; newest first in each (groupQuestions).
  const rows: Question[] = [...waiting, ...answered]
  const open = openId ? (rows.find((q) => q.id === openId) ?? null) : null
  const statusOf = (q: Question) =>
    isAnswered(q) ? t('student.teacherReplied', lang) : t('student.awaitingReply', lang)

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
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

      {open && (
        <section id="q" aria-labelledby="q-title" className="mb-section scroll-mt-24">
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="q-title" className="font-bold">
                  {open.subject}
                </h2>
                {aboutOf(open) && (
                  <p className="text-xs text-muted">
                    {t('student.questionAbout', lang)}: <span className="font-medium">{aboutOf(open)}</span>
                  </p>
                )}
              </div>
              <Link
                href="/student/questions"
                scroll={false}
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong px-3 text-xs font-semibold hover:bg-paper-muted max-sm:h-11"
              >
                {t('common.close', lang)}
              </Link>
            </div>

            {/* The sequence, oldest first: asked, then the reply or the wait. */}
            <ol className="ui-stagger relative ml-1 space-y-5 border-l-2 border-line pl-5">
              <li className="relative">
                <span className="absolute -left-[27px] top-1">
                  <ToneDot tone="brand" />
                </span>
                <p className="text-xs font-semibold text-brand-600">
                  {t('student.questionBody', lang)} · <span className="text-muted">{formatDateTime(open.created_at, lang)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{open.body}</p>
              </li>
              {open.reply_body ? (
                <li className="relative">
                  <span className="absolute -left-[27px] top-1">
                    <ToneDot tone="mint" />
                  </span>
                  <p className="text-xs font-semibold text-mint-deep">
                    {t('student.teacherReplied', lang)}
                    {open.replied_at && (
                      <>
                        {' · '}
                        <span className="text-muted">{formatDateTime(open.replied_at, lang)}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-mint-soft p-3 text-sm">{open.reply_body}</p>
                </li>
              ) : (
                <li className="relative">
                  <span className="absolute -left-[27px] top-1">
                    <ToneDot tone={waitingTone(open, now) ?? 'sky'} pulse />
                  </span>
                  <p className="text-xs font-semibold text-muted">{t('student.awaitingReply', lang)}</p>
                </li>
              )}
            </ol>
          </Card>
        </section>
      )}

      {!rows.length ? (
        <EmptyState
          lang={lang}
          title={t('student.noQuestions', lang)}
          body={t('student.noQuestionsHint', lang)}
          action={{ href: '/student/notices', label: t('student.nav.notices', lang) }}
        />
      ) : (
        <Card padded={false}>
          <TableFrame>
            <thead>
              <tr>
                <th className={thClass}>{t('student.questionSubject', lang)}</th>
                <th className={`${thClass} max-sm:hidden`}>{t('student.questionAbout', lang)}</th>
                <th className={thClass}>{t('student.examDate', lang)}</th>
                <th className={thClass}>{t('questions.colStatus', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const selected = q.id === open?.id
                const tone = waitingTone(q, now) ?? (isAnswered(q) ? 'mint' : 'sky')
                return (
                  <tr key={q.id} className={`${trClass} ${selected ? 'bg-brand-50' : ''}`}>
                    <td className={`${tdClass} max-w-[16rem] truncate ${railClass(tone)}`}>
                      <Link
                        href={`/student/questions?q=${q.id}#q`}
                        aria-current={selected ? 'true' : undefined}
                        className="inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline sm:min-h-0"
                      >
                        {q.subject}
                      </Link>
                    </td>
                    <td className={`${tdClass} max-w-[14rem] truncate text-muted max-sm:hidden`}>{aboutOf(q) ?? '—'}</td>
                    <td className={`${tdClass} text-muted`}>{formatDate(q.created_at, lang)}</td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center gap-2 text-xs font-semibold">
                        <ToneDot tone={tone} />
                        {statusOf(q)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableFrame>
        </Card>
      )}
    </main>
  )
}
