import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { loadStudentTasks } from '@/lib/student/tasks-read'
import type { StudentTask } from '@/lib/student/tasks'
import { dashboardTaskCounts, taskUrgency, type TaskUrgency } from '@/lib/student/dashboard'
import { TASK_PILES, taskPiles } from '@/lib/student/daily'
import { matchesQ, pageOf, taskStateMatches } from '@/lib/student/table'
import { schoolToday } from '@/lib/school-time'
import { studentGroupTabs } from '@/lib/student-nav'
import { TaskToggle } from './task-toggle'
import { pageTitle } from '@/lib/page-title'
import { PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'
import { ToneDot } from '@/components/ui/widgets'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'

// The Student's homework (#446) as one table. The four piles (overdue, due
// within the horizon, later, done) are the `state` filter; the default view is
// every open task. Done beats overdue: finished late is still finished. A task
// handed in but not yet ticked counts as done too (decision D2; see
// isTaskHandled). Placement is by school day, in lib/student/daily.ts.
export const generateMetadata = pageTitle('student.tasksTitle')

const PILE: Record<TaskUrgency, { labelKey: MessageKey; tone: 'alert' | 'sun' | 'muted' | 'mint' }> = {
  overdue: { labelKey: 'student.taskOverdue', tone: 'alert' },
  dueSoon: { labelKey: 'student.taskDueSoon', tone: 'sun' },
  later: { labelKey: 'student.taskLater', tone: 'muted' },
  done: { labelKey: 'student.taskDone', tone: 'mint' },
}

export default async function StudentTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const today = schoolToday()
  const tasks = await loadStudentTasks(ctx.supabase)
  const piles = taskPiles(tasks, today)
  const counts = dashboardTaskCounts(tasks, today)
  const readOnly = isReadOnly(ctx)

  // Pile order (overdue, soon, later, done) is the table's order.
  const ordered = TASK_PILES.flatMap((p) => piles[p])
  const shown = ordered.filter(
    (task) => taskStateMatches(params.state, taskUrgency(task, today)) && matchesQ(params.q, task.title),
  )
  const paged = pageOf(shown, params)
  // One pulse on the page: the first overdue row names the state.
  const firstOverdueId = shown.find((task) => taskUrgency(task, today) === 'overdue')?.id

  const columns: Column<StudentTask>[] = [
    {
      key: 'title',
      header: t('student.col.title', lang),
      card: 'title',
      cell: (task) => (
        <Link
          href={`/student/tasks/${task.id}`}
          className="inline-flex min-h-11 items-center font-semibold hover:text-brand-600 hover:underline md:min-h-0"
        >
          {task.title}
        </Link>
      ),
    },
    {
      key: 'due',
      header: t('student.taskDue', lang),
      cell: (task) => (task.due_at ? formatDate(task.due_at, lang) : <span className="text-muted">—</span>),
    },
    {
      key: 'state',
      header: t('student.col.state', lang),
      card: 'badge',
      cell: (task) => {
        const u = taskUrgency(task, today)
        return (
          <span className="inline-flex items-center gap-1.5">
            {u === 'overdue' && task.id === firstOverdueId && <ToneDot tone="alert" pulse />}
            <Pill tone={PILE[u].tone}>{t(PILE[u].labelKey, lang)}</Pill>
          </span>
        )
      },
    },
    {
      key: 'handedIn',
      header: t('student.col.handedIn', lang),
      cell: (task) =>
        task.submitted ? (
          <span className="font-semibold text-mint-deep">✓ {t('student.handedIn', lang)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ]

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
        <DataTable
          rows={paged.items}
          rowId={(task) => task.id}
          rowLabel={(task) => task.title}
          columns={columns}
          lang={lang}
          params={params}
          caption={t('student.tasksTitle', lang)}
          search={{ placeholder: t('student.col.search', lang) }}
          filters={[
            {
              param: 'state',
              label: t('student.col.openTasks', lang),
              options: [
                ...TASK_PILES.map((p) => ({ value: p, label: t(PILE[p].labelKey, lang) })),
                { value: 'all', label: t('student.col.allTasks', lang) },
              ],
            },
          ]}
          rowActions={(task) => (
            <TaskToggle lang={lang} taskId={task.id} done={Boolean(task.completed_at)} disabled={readOnly} />
          )}
          pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
          empty={<NoMatch lang={lang} />}
        />
      )}
    </main>
  )
}
