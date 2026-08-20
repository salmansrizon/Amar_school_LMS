import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { railClass } from '@/components/ui/page'

// Agent detail (#271). The agent's distributor plus their assigned tasks.
export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getSuperAdminContext()

  const { data: assignment } = await supabase
    .from('agent_assignments')
    .select('agent_id, assigned_at, agent:profiles!agent_assignments_agent_id_fkey(full_name), distributor:profiles!agent_assignments_distributor_id_fkey(full_name)')
    .eq('agent_id', id)
    .maybeSingle()
  if (!assignment) notFound()

  const { data: tasks } = await supabase
    .from('partner_tasks')
    .select('id, title, status, due_at')
    .eq('assignee_id', id)
    .order('due_at', { ascending: true })

  const a = assignment as {
    agent?: { full_name?: string | null } | null
    distributor?: { full_name?: string | null } | null
  }

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{a.agent?.full_name ?? 'Agent'}</h1>
        <Link href="/super-admin/agents" className="text-sm text-brand-600 hover:underline">
          ← Agents
        </Link>
      </div>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5">
        <div className="text-sm text-muted">Reports to</div>
        <div className="font-semibold">{a.distributor?.full_name ?? 'unassigned'}</div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Assigned tasks</h2>
        <ul className="divide-y divide-line">
          {tasks?.map((t) => (
            <li key={t.id} className={`flex items-center justify-between py-2 pl-2 text-sm ${railClass(t.status === 'done' ? 'mint' : 'sun')}`}>
              <span className="font-medium">{t.title}</span>
              <span className="flex items-center gap-3">
                {t.due_at && (
                  <span className="text-xs text-muted">
                    {new Date(t.due_at).toLocaleDateString('en-GB')}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.status === 'done' ? 'bg-mint-soft text-mint-deep' : 'bg-sun-soft text-sun-deep'}`}
                >
                  {t.status}
                </span>
              </span>
            </li>
          ))}
          {!tasks?.length && <li className="py-2 text-sm text-muted">No tasks assigned.</li>}
        </ul>
      </section>
    </main>
  )
}
