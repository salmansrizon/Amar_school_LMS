import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { AskForm } from './ask-form'
import { groupQuestions } from '@/lib/student/daily'
import { waitingTone } from '@/lib/student/hub'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader, railClass } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

// The Student's own questions (#454). One question, one reply — not a thread.
export const generateMetadata = pageTitle('student.questionsTitle')

export default async function StudentQuestionsPage() {
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
  // Waiting: sky, then sun after 24 h and alert after 72 h (waitingTone).
  // Answered: mint. The rail is decoration; the words say which is which.
  const QuestionCard = ({ q }: { q: Question }) => (
    <li className={`rounded-lg border border-line bg-paper p-4 ${railClass(waitingTone(q, now) ?? 'sky')}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{q.subject}</span>
        <span className="text-xs text-muted">{formatDate(q.created_at, lang)}</span>
      </div>
      {aboutOf(q) && (
        <p className="mb-2 text-xs text-muted">
          {t('student.questionAbout', lang)}: <span className="font-medium">{aboutOf(q)}</span>
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm">{q.body}</p>

      {q.reply_body ? (
        <div className="mt-3 rounded-md bg-mint-soft p-3">
          <span className="block text-xs font-semibold text-mint-deep">{t('student.teacherReplied', lang)}</span>
          <p className="mt-1 whitespace-pre-wrap text-sm">{q.reply_body}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-muted">{t('student.awaitingReply', lang)}</p>
      )}
    </li>
  )

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

      <div className="grid items-start gap-grid lg:grid-cols-3">
        <div className={readOnly ? 'lg:col-span-3' : 'lg:col-span-2'}>
          {!mine?.length ? (
            <EmptyState
              lang={lang}
              title={t('student.noQuestions', lang)}
              body={t('student.noQuestionsHint', lang)}
              action={{ href: '/student/notices', label: t('student.nav.notices', lang) }}
            />
          ) : (
            <div className="space-y-section">
              {(
                [
                  [waiting, 'student.awaitingReply'],
                  [answered, 'student.teacherReplied'],
                ] as const
              )
                .filter(([list]) => list.length > 0)
                .map(([list, titleKey]) => (
                  <section key={titleKey}>
                    <h2 className="mb-3 text-sm font-bold">
                      {t(titleKey, lang)} · {formatNumber(list.length, lang)}
                    </h2>
                    <ul className="space-y-3">
                      {list.map((q) => (
                        <QuestionCard key={q.id} q={q} />
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          )}
        </div>

        {!readOnly && (
          <div id="ask" className="scroll-mt-24">
            <Card>
              <h2 className="mb-3 font-bold">{t('student.askGeneral', lang)}</h2>
              <AskForm lang={lang} subjects={subjectRows ?? []} />
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
