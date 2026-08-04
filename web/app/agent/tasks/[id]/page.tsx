import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAgentContext } from '@/lib/agent/context'
import { TaskToggle } from './task-toggle'

// Agent task detail (#271). RLS scopes the row to the assignee.
export default async function AgentTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getAgentContext()

  const { data: task } = await supabase
    .from('partner_tasks')
    .select('id, title, status, due_at, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!task) notFound()

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{task.title}</h1>
        <Link href="/agent/tasks" className="text-sm text-brand-600 hover:underline">
          ← Tasks
        </Link>
      </div>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Status</dt>
            <dd>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${task.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
              >
                {task.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Due</dt>
            <dd className="font-medium">
              {task.due_at ? new Date(task.due_at).toLocaleDateString('en-GB') : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <TaskToggle id={task.id} status={task.status} />
      </section>
    </main>
  )
}
