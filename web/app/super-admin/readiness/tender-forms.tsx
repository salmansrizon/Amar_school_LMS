'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { createTenderProfile, updateTenderEvidence } from './actions'

const input = 'h-9 w-full rounded-lg border border-line-strong px-2 text-xs focus:border-brand-500 focus:outline-none'

export function TenderProfileForm() {
  const { error, pending, onSubmit } = useCrudAction(createTenderProfile, { resetOnSuccess: true })
  return <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onSubmit}>
    <input name="procuring_entity" required placeholder="Procuring entity" className={input} />
    <input name="tender_reference" required placeholder="Tender/document reference" className={input} />
    <input name="document_version" placeholder="Document version" className={input} />
    <input name="document_date" type="date" className={input} />
    <input name="submission_deadline" type="datetime-local" className={input} />
    <button type="submit" disabled={pending} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white disabled:opacity-50">Create blocked profile</button>
    {error && <p className="text-xs text-alert-deep sm:col-span-2">{error}</p>}
  </form>
}

export function TenderEvidenceForm({ item }: { item: { id: string; evidence_area: string; buyer_requirement: string | null; amar_evidence: string | null; accountable_owner: string | null; status: string } }) {
  const { error, pending, onSubmit } = useCrudAction(updateTenderEvidence)
  return <form className="grid gap-2 rounded-md border border-line p-3" onSubmit={onSubmit}>
    <input type="hidden" name="id" value={item.id} />
    <strong className="text-sm">{item.evidence_area}</strong>
    <input name="buyer_requirement" defaultValue={item.buyer_requirement ?? ''} placeholder="Buyer requirement" className={input} />
    <input name="amar_evidence" defaultValue={item.amar_evidence ?? ''} placeholder="Amar evidence / link" className={input} />
    <div className="flex gap-2"><input name="accountable_owner" defaultValue={item.accountable_owner ?? ''} placeholder="Accountable owner" className={input} /><select name="status" defaultValue={item.status === 'approved' ? 'ready' : item.status} className={input}><option value="blocked">Blocked</option><option value="baseline">Baseline</option><option value="ready">Ready</option></select><button type="submit" disabled={pending} className="h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold whitespace-nowrap disabled:opacity-50">Save</button></div>
    {error && <p className="text-xs text-alert-deep">{error}</p>}
  </form>
}
