import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type Lang, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { loadStudentTasks } from '@/lib/student/tasks-read'
import type { StudentTask } from '@/lib/student/tasks'
import { dashboardTaskCounts, type TaskUrgency } from '@/lib/student/dashboard'
import { TASK_PILES, taskPiles } from '@/lib/student/daily'
import { schoolToday } from '@/lib/school-time'
import { studentGroupTabs } from '@/lib/student-nav'
import { TaskToggle } from './task-toggle'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader, railClass, type Tone } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

// The Student's homework (#446), in four piles: overdue, due within two days,
// later, done. Done beats overdue: finished late is still finished. A task
// handed in but not yet ticked counts as done too (decision D2; see
// isTaskHandled). Placement is by school day, in lib/student/daily.ts.
export const generateMetadata = pageTitle('student.tasksTitle')

const PILE: Record<TaskUrgency, { titleKey: MessageKey; rail: Tone; text: string }> = {
  overdue: { titleKey: 'student.taskOverdue', rail: 'alert', text: 'text-alert-deep' },
  dueSoon: { titleKey: 'student.taskDueSoon', rail: 'sun', text: 'text-sun-deep' },
  later: { titleKey: 'student.taskLater', rail: 'muted', text: 'text-muted' },
  done: { titleKey: 'student.taskDone', rail: 'mint', text: 'text-mint-deep' },
}

function TaskRow({ task, rail, lang, readOnly }: { task: StudentTask; rail: Tone; lang: Lang; readOnly: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-3 py-1.5 pr-3 pl-3 ${railClass(rail)}`}>
      <Link
        href={`/student/tasks/${task.id}`}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center hover:text-brand-600"
      >
        <span className="truncate text-sm font-medium">{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {task.due_at && (
            <span>
              {t('student.taskDue', lang)}: {formatDate(task.due_at, lang)}
            </span>
          )}
          {task.submitted && (
            <span className="font-semibold text-mint-deep">{t('student.handedIn', lang)}</span>
          )}
        </span>
      </Link>
      <TaskToggle lang={lang} taskId={task.id} done={Boolean(task.completed_at)} disabled={readOnly} />
    </li>
  )
}

export default async function StudentTasksPage() {
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const today = schoolToday()
  const tasks = await loadStudentTasks(ctx.supabase)
  const piles = taskPiles(tasks, today)
  const counts = dashboardTaskCounts(tasks, today)
  const readOnly = isReadOnly(ctx)

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.tasksTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.navGroup.study', lang) }] }}
        subtitle={t('student.ownClaim', lang)}
        badge={counts.overdue ? `${formatNumber(counts.overdue, lang)} ${t('student.dash.overdueNote', lang)}` : undefined}
      />
      <SectionTabs
        tabs={studentGroupTabs('study', { tasks: counts.pending })}
        active="/student/tasks"
        lang={lang}
        label={t('student.navGroup.study', lang)}
      />

      {!tasks.length ? (
        <EmptyState
          lang={lang}
          title={t('student.noTasks', lang)}
          action={{ href: '/student/routine', label: t('student.nav.routine', lang) }}
        />
      ) : (
        <div className="grid items-start gap-grid lg:grid-cols-2">
          {TASK_PILES.filter((p) => piles[p].length > 0).map((p) => (
            <Card key={p} padded={false}>
              <h2 className={`px-card pt-card pb-2 text-sm font-bold ${PILE[p].text}`}>
                {t(PILE[p].titleKey, lang)} · {formatNumber(piles[p].length, lang)}
              </h2>
              <ul className="divide-y divide-line pb-2">
                {piles[p].map((task) => (
                  <TaskRow key={task.id} task={task} rail={PILE[p].rail} lang={lang} readOnly={readOnly} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
