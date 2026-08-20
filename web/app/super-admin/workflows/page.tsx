import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { AddDefinitionForm, DefinitionActions, AddStageForm, DeleteStageButton } from './workflow-forms'
import { railClass } from '@/components/ui/page'

type Labelled = { label?: { en?: string; bn?: string } | null }
const en = (x: Labelled, fallback: string) => x.label?.en ?? fallback

// Workflow config CRUD (#289, over #271 viewer) + approvals inbox. Create/edit
// definitions + stages; the inbox stays read-only (approve/reject is a follow-up).
export default async function WorkflowsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: defs }, { data: stages }, { data: instances }] = await Promise.all([
    supabase.from('workflow_definitions').select('key, label, active').order('key'),
    supabase.from('workflow_stages').select('id, definition_key, seq, name, approver_role').order('seq'),
    supabase
      .from('workflow_instances')
      .select('id, definition_key, entity_type, entity_id, status, current_seq, created_at')
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const stagesByDef = new Map<string, typeof stages>()
  for (const s of stages ?? []) {
    stagesByDef.set(s.definition_key, [...(stagesByDef.get(s.definition_key) ?? []), s])
  }

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Workflows</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Add a workflow</h2>
        <AddDefinitionForm />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Definitions</h2>
        <div className="space-y-3">
          {defs?.map((d) => (
            <div key={d.key} className={`rounded-lg border border-line p-3 ${railClass(d.active ? 'mint' : 'muted')}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{en(d as Labelled, d.key)}</span>
                  <span className="font-mono text-xs text-muted">{d.key}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.active ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-ink'}`}
                  >
                    {d.active ? 'active' : 'inactive'}
                  </span>
                </span>
                <DefinitionActions defKey={d.key} active={d.active} />
              </div>
              <ol className="flex flex-wrap items-center gap-2 text-xs">
                {(stagesByDef.get(d.key) ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-1 font-semibold text-brand-700"
                  >
                    {s.seq}. {en(s as Labelled, `stage ${s.seq}`)}
                    {s.approver_role ? ` · ${s.approver_role}` : ''}
                    <DeleteStageButton id={s.id} />
                  </li>
                ))}
                {!stagesByDef.get(d.key)?.length && <li className="text-muted">No stages.</li>}
              </ol>
              <AddStageForm definitionKey={d.key} />
            </div>
          ))}
          {!defs?.length && <p className="text-sm text-muted">No workflow definitions.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Approvals inbox ({instances?.length ?? 0})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Workflow</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">Stage</th>
                <th className="py-2 pr-4">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {instances?.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-4 font-medium">{i.definition_key}</td>
                  <td className="py-2 pr-4 text-muted">
                    {i.entity_type} <span className="font-mono text-xs">{i.entity_id}</span>
                  </td>
                  <td className="py-2 pr-4">{i.current_seq}</td>
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    {new Date(i.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
              {!instances?.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    Nothing awaiting approval.
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
