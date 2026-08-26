import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { MAX_SUBMISSION_FILES } from '@/lib/student/submissions'
import { SubmitWork, WithdrawButton } from './submit-work'
import { AskForm } from '../../questions/ask-form'

// One task, with the Student's own submitted work (#448).
//
// Submitting is separate from ticking the task done (#446): the tick is a claim
// about their work, this is the work. A student can do either, both, or neither.
export default async function StudentTaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const ctx = await getStudentContext()

  const { data: task } = await ctx.supabase
    .from('publications')
    .select('id, title, content, due_at')
    .eq('id', id)
    .eq('kind', 'homework')
    .maybeSingle()
  if (!task) notFound()

  const { data: mine } = await ctx.supabase
    .from('homework_submissions')
    .select('id, file_name, file_size, submitted_at, reviewed_at, teacher_comment, marks')
    .eq('publication_id', id)
    .order('submitted_at', { ascending: false })

  const submissions = mine ?? []
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full max-w-3xl p-6">
      <Link href="/student/tasks" className="text-sm text-brand-600 hover:underline">
        ← {t('student.tasksTitle', lang)}
      </Link>

      <h1 className="mt-3 mb-1 text-2xl font-extrabold">{task.title}</h1>
      {task.due_at && (
        <p className="mb-3 text-xs text-muted">
          {t('student.taskDue', lang)}:{' '}
          {new Date(task.due_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      {task.content && <p className="mb-4 whitespace-pre-wrap text-sm">{task.content}</p>}

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('student.mySubmissions', lang)}</h2>

        {!submissions.length ? (
          <p className="mb-3 text-sm text-muted">{t('student.noSubmission', lang)}</p>
        ) : (
          <ul className="mb-3 divide-y divide-line">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <a
                    href={`/api/student/submission?id=${s.id}`}
                    className="block truncate text-sm font-medium text-brand-600 hover:underline"
                  >
                    {s.file_name}
                  </a>
                  <span className="block text-xs text-muted">
                    {new Date(s.submitted_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    {s.reviewed_at && ` · ${t('student.reviewed', lang)}`}
                    {s.marks !== null && ` · ${s.marks}`}
                  </span>
                  {s.teacher_comment && (
                    <span className="mt-1 block text-xs italic text-muted">{s.teacher_comment}</span>
                  )}
                </span>
                {/* A reviewed submission cannot be withdrawn — RLS refuses it,
                    so the button is not offered either. */}
                {!s.reviewed_at && (
                  <WithdrawButton lang={lang} submissionId={s.id} publicationId={task.id} />
                )}
              </li>
            ))}
          </ul>
        )}

        {submissions.length < MAX_SUBMISSION_FILES && (
          <SubmitWork
            lang={lang}
            publicationId={task.id}
            existingCount={submissions.length}
            disabled={isReadOnly(ctx)}
          />
        )}
      </section>

      {!isReadOnly(ctx) && (
        <section className="mt-4 rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 font-bold">{t('student.askAbout', lang)}</h2>
          <AskForm lang={lang} publicationId={task.id} />
        </section>
      )}
    </main>
  )
}
