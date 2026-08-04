import Link from 'next/link'
import { getAgentContext } from '@/lib/agent/context'

// Agent dashboard (#271). Task snapshot for the signed-in agent. Tasks are
// RLS-scoped via the "assignee reads task" policy.
export default async function AgentHome() {
  const { supabase, fullName } = await getAgentContext()

  const { data: tasks } = await supabase
    .from('partner_tasks')
    .select('id, title, status, due_at')
    .order('due_at', { ascending: true })

  const open = (tasks ?? []).filter((t) => t.status === 'open')
  const done = (tasks ?? []).filter((t) => t.status === 'done')

  const stats = [
    { label: 'Open tasks', value: open.length },
    { label: 'Completed', value: done.length },
  ]

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{fullName}</h1>
      <p className="mb-4 text-sm text-muted">Agent overview</p>

      <section className="mb-6 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-paper p-4 shadow-card">
            <div className="text-2xl font-extrabold text-brand-700">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Next up</h2>
        <ul className="divide-y divide-line">
          {open.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/agent/tasks/${t.id}`} className="font-medium hover:text-brand-600">
                {t.title}
              </Link>
              {t.due_at && (
                <span className="text-xs text-muted">
                  {new Date(t.due_at).toLocaleDateString('en-GB')}
                </span>
              )}
            </li>
          ))}
          {!open.length && <li className="py-2 text-sm text-muted">Nothing open. Nice.</li>}
        </ul>
      </section>
    </main>
  )
}
