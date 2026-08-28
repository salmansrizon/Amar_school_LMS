import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, localeOf, numberFmt, type Lang, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { loadStudentTasks } from '@/lib/student/tasks-read'
import { splitTasks, type StudentTask, type TaskBucket } from '@/lib/student/tasks'
import { TaskToggle } from './task-toggle'
import { pageTitle } from '@/lib/student/metadata'

// The Student's homework (#446), split into the piles that make a list useful:
// overdue, due soon, later, done. Done beats overdue — finished late is still
// finished, and red forever would nag rather than inform.

const SECTIONS: { bucket: TaskBucket; titleKey: MessageKey; tone: string }[] = [
  { bucket: 'overdue', titleKey: 'student.taskOverdue', tone: 'text-alert-deep' },
  { bucket: 'dueSoon', titleKey: 'student.taskDueSoon', tone: 'text-sun-deep' },
  { bucket: 'later', titleKey: 'student.taskLater', tone: 'text-muted' },
  { bucket: 'done', titleKey: 'student.taskDone', tone: 'text-mint-deep' },
]

function TaskRow({ task, lang, readOnly }: { task: StudentTask; lang: Lang; readOnly: boolean }) {
  const locale = localeOf(lang)
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <span className="min-w-0">
        <Link
          href={`/student/tasks/${task.id}`}
          className="block text-sm font-medium hover:text-brand-600"
        >
          {task.title}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          {task.due_at && (
            <span className="text-xs text-muted">
              {t('student.taskDue', lang)}:{' '}
              {new Date(task.due_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </span>
          )}
          {task.submitted && (
            <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[11px] font-semibold text-mint-deep">
              {t('student.handedIn', lang)}
            </span>
          )}
        </span>
      </span>
      <TaskToggle lang={lang} taskId={task.id} done={Boolean(task.completed_at)} disabled={readOnly} />
    </li>
  )
}

export const generateMetadata = pageTitle('student.tasksTitle')

export default async function StudentTasksPage() {
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const buckets = splitTasks(await loadStudentTasks(ctx.supabase), new Date())
  const readOnly = isReadOnly(ctx)
  const empty = SECTIONS.every((s) => buckets[s.bucket].length === 0)

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{t('student.tasksTitle', lang)}</h1>
      <p className="mb-4 text-xs text-muted">{t('student.ownClaim', lang)}</p>

      {empty ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noTasks', lang)}
        </p>
      ) : (
        <div className="space-y-4">
          {SECTIONS.filter((s) => buckets[s.bucket].length > 0).map((s) => (
            <section key={s.bucket} className="rounded-lg border border-line bg-paper p-5">
              <h2 className={`mb-2 text-sm font-bold ${s.tone}`}>
                {t(s.titleKey, lang)} · {numberFmt(lang).format(buckets[s.bucket].length)}
              </h2>
              <ul className="divide-y divide-line">
                {buckets[s.bucket].map((task) => (
                  <TaskRow key={task.id} task={task} lang={lang} readOnly={readOnly} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
