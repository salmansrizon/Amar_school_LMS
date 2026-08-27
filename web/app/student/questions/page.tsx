import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { AskForm } from './ask-form'
import { pageTitle } from '@/lib/student/metadata'

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

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.questionsTitle', lang)}</h1>

      {!isReadOnly(ctx) && (
        <section className="mb-6 rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 font-bold">{t('student.askGeneral', lang)}</h2>
          <AskForm lang={lang} subjects={subjectRows ?? []} />
        </section>
      )}

      {!mine?.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noQuestions', lang)}
        </p>
      ) : (
        <ul className="space-y-3">
          {mine.map((q) => (
            <li key={q.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{q.subject}</span>
                <span className="text-xs text-muted">
                  {new Date(q.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
              </div>
              {aboutOf(q) && (
                <p className="mb-2 text-xs text-muted">
                  {t('student.questionAbout', lang)}: <span className="font-medium">{aboutOf(q)}</span>
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm">{q.body}</p>

              {q.reply_body ? (
                <div className="mt-3 rounded-md bg-mint-soft p-3">
                  <span className="block text-xs font-semibold text-mint-deep">
                    {t('student.teacherReplied', lang)}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{q.reply_body}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">{t('student.awaitingReply', lang)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
