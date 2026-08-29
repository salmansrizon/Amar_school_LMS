'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { updateLegalProfile } from './actions'

const input = 'h-10 w-full rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'

export function LegalProfileForm({
  legal,
}: {
  legal: { status: string; legal_entity_name: string | null; tin: string | null; bin: string | null; registered_address: string | null; adviser_evidence: string | null } | null
}) {
  const { error, pending, onSubmit } = useCrudAction(updateLegalProfile)
  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
      <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-muted">Legal entity name</span><input name="legal_entity_name" defaultValue={legal?.legal_entity_name ?? ''} className={input} /></label>
      <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-muted">TIN</span><input name="tin" defaultValue={legal?.tin ?? ''} className={input} /></label>
      <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-muted">BIN</span><input name="bin" defaultValue={legal?.bin ?? ''} className={input} /></label>
      <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-muted">Status</span><select name="status" defaultValue={legal?.status ?? 'pending'} className={input}><option value="pending">Pending</option><option value="ready">Ready for review</option></select></label>
      <label className="text-sm sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-muted">Registered address</span><input name="registered_address" defaultValue={legal?.registered_address ?? ''} className={input} /></label>
      <label className="text-sm sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-muted">Adviser evidence / source reference</span><input name="adviser_evidence" defaultValue={legal?.adviser_evidence ?? ''} className={input} placeholder="Add document or adviser reference" /></label>
      <button type="submit" disabled={pending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-2 sm:w-fit">Save legal profile</button>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
    </form>
  )
}
