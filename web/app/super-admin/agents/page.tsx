import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'

// Agents list (#271 / partner-management 0092). Every agent and the distributor
// they report to. Super-admin oversight surface.
export default async function AgentsPage() {
  const { supabase } = await getSuperAdminContext()

  const { data: agents } = await supabase
    .from('agent_assignments')
    .select('agent_id, assigned_at, agent:profiles!agent_assignments_agent_id_fkey(full_name), distributor:profiles!agent_assignments_distributor_id_fkey(full_name)')
    .order('assigned_at', { ascending: false })

  type Row = {
    agent_id: string
    assigned_at: string
    agent?: { full_name?: string | null } | null
    distributor?: { full_name?: string | null } | null
  }

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Agents</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5">
        <ul className="divide-y divide-line">
          {(agents as Row[] | null)?.map((a) => (
            <li key={a.agent_id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">{a.agent?.full_name ?? a.agent_id.slice(0, 8)}</div>
                <div className="text-xs text-muted">
                  under {a.distributor?.full_name ?? 'unassigned'}
                </div>
              </div>
              <Link
                href={`/super-admin/agents/${a.agent_id}`}
                className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
              >
                tasks
              </Link>
            </li>
          ))}
          {!agents?.length && <li className="py-6 text-center text-muted">No agents assigned.</li>}
        </ul>
      </section>
    </main>
  )
}
