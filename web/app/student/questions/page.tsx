import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { AskForm } from './ask-form'

// The Student's own questions (#454). One question, one reply — not a thread.
export default async function StudentQuestionsPage() {
  const lang = await currentLang()
  const ctx = await getStudentContext()

  const [{ data: mine }, { data: subjectRows }] = await Promise.all([
    ctx.supabase
      .from('student_messages')
      .select('id, subject, body, status, reply_body, replied_at, created_at')
      .order('created_at', { ascending: false }),
    // A general question must name a subject, and the anchor needs its id —
    // student_subject_option is the one place a Student may read that.
    ctx.supabase.from('student_subject_option').select('id, name').order('name'),
  ])

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
