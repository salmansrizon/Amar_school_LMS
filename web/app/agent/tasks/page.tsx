import Link from 'next/link'
import { getAgentContext } from '@/lib/agent/context'

// Agent task list (#271). Every task assigned to the signed-in agent.
export default async function AgentTasksPage() {
  const { supabase } = await getAgentContext()

  const { data: tasks } = await supabase
    .from('partner_tasks')
    .select('id, title, status, due_at')
    .order('status', { ascending: true })
    .order('due_at', { ascending: true })

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-extrabold">Tasks</h1>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <ul className="divide-y divide-line">
          {tasks?.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/agent/tasks/${t.id}`} className="font-medium hover:text-brand-600">
                {t.title}
              </Link>
              <span className="flex items-center gap-3">
                {t.due_at && (
                  <span className="text-xs text-muted">
                    {new Date(t.due_at).toLocaleDateString('en-GB')}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                >
                  {t.status}
                </span>
              </span>
            </li>
          ))}
          {!tasks?.length && <li className="py-6 text-center text-muted">No tasks assigned.</li>}
        </ul>
      </section>
    </main>
  )
}
