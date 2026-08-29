'use client'

import { useCrudAction } from '@/lib/crud/use-crud-action'
import { updateTaxTreatment } from './actions'

export function TaxTreatmentForm({ item }: { item: { id: string; rate_bp: number; inclusive: boolean; source_reference: string | null } }) {
  const { error, pending, onSubmit } = useCrudAction(updateTaxTreatment)
  return <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={onSubmit}>
    <input type="hidden" name="id" value={item.id} />
    <input name="rate_bp" type="number" min="0" step="1" defaultValue={item.rate_bp} className="h-8 w-24 rounded border border-line-strong px-2 text-xs" aria-label="Tax rate basis points" />
    <label className="flex items-center gap-1 text-xs"><input name="inclusive" type="checkbox" value="true" defaultChecked={item.inclusive} /> inclusive</label>
    <input name="source_reference" defaultValue={item.source_reference ?? ''} placeholder="Source reference" className="h-8 min-w-48 flex-1 rounded border border-line-strong px-2 text-xs" />
    <button type="submit" disabled={pending} className="h-8 rounded border border-line-strong px-2 text-xs font-semibold disabled:opacity-50">Save pending</button>
    {error && <p className="w-full text-xs text-alert-deep">{error}</p>}
  </form>
}
