import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'

// Audit log viewer (#271 / audit engine 0078). Read-only platform trail: the
// last 200 actions across explicit audit() calls and event-driven inserts.
export default async function AuditLogPage() {
  const { supabase } = await getSuperAdminContext()

  const { data: rows } = await supabase
    .from('audit_log')
    .select('id, actor_id, school_id, entity_type, entity_id, action, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const actionTone: Record<string, string> = {
    create: 'bg-emerald-50 text-emerald-700',
    update: 'bg-sky-soft text-sky-deep',
    delete: 'bg-alert-soft text-alert-deep',
    approve: 'bg-emerald-50 text-emerald-700',
    reject: 'bg-alert-soft text-alert-deep',
    configure: 'bg-amber-50 text-amber-700',
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Audit Log</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="mb-3 text-sm text-muted">Latest 200 recorded actions. Newest first.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">Ref</th>
                <th className="py-2 pr-4">Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted">
                    {new Date(r.created_at).toLocaleString('en-GB')}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${actionTone[r.action] ?? 'bg-paper-muted text-ink'}`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-medium">{r.entity_type}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted">{r.entity_id}</td>
                  <td className="py-2 pr-4 text-xs text-muted">
                    {r.school_id ? 'school' : 'platform'}
                  </td>
                </tr>
              ))}
              {!rows?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No audit records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
