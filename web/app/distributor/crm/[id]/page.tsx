import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDistributorContext } from '@/lib/distributor/context'
import { StageControl } from './stage-control'

// Lead detail (#271). RLS scopes the row to the signed-in distributor.
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getDistributorContext()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, school_name, contact_name, contact_phone, stage, notes, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!lead) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{lead.school_name}</h1>
        <Link href="/distributor/crm" className="text-sm text-brand-600 hover:underline">
          ← Pipeline
        </Link>
      </div>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Contact</dt>
            <dd className="font-medium">{lead.contact_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Phone</dt>
            <dd className="font-medium">{lead.contact_phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Added</dt>
            <dd className="font-medium">{new Date(lead.created_at).toLocaleDateString('en-GB')}</dd>
          </div>
        </dl>
        {lead.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{lead.notes}</p>}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <StageControl id={lead.id} current={lead.stage} />
      </section>
    </main>
  )
}
