import Link from 'next/link'
import { getDistributorContext } from '@/lib/distributor/context'
import { LEAD_STAGES } from '@/lib/distributor/leads'
import { AddLeadForm } from './add-lead-form'

// Distributor CRM pipeline (#271). Own leads grouped by stage; RLS scopes the
// query to the signed-in distributor.
export default async function CrmPage() {
  const { supabase } = await getDistributorContext()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, school_name, contact_name, stage')
    .order('updated_at', { ascending: false })

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-extrabold">CRM Pipeline</h1>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">Add a lead</h2>
        <AddLeadForm />
      </section>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {LEAD_STAGES.map((s) => {
          const items = (leads ?? []).filter((l) => l.stage === s.key)
          return (
            <div key={s.key} className="rounded-lg border border-line bg-paper-muted p-3">
              <div className={`mb-2 flex items-center justify-between text-xs font-bold uppercase ${s.tone}`}>
                <span>{s.label}</span>
                <span>{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/distributor/crm/${l.id}`}
                      className="block rounded-lg border border-line bg-paper p-2 text-sm shadow-card hover:border-brand-300"
                    >
                      <div className="font-semibold">{l.school_name}</div>
                      {l.contact_name && <div className="text-xs text-muted">{l.contact_name}</div>}
                    </Link>
                  </li>
                ))}
                {!items.length && <li className="text-xs text-muted">—</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </main>
  )
}
