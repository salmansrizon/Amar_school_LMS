import type { ReactNode } from 'react'
import { Card } from '@/components/ui/page'

// Student lists: the generic DataTable from `sm` up, compact one-line rows
// below it. The page computes its rows once; `rows` here is the <li> list built
// from the same paged items as the DataTable. We cannot edit DataTable, so the
// shell steers it with arbitrary-variant classes on a wrapper:
//  - DataTable's own phone cards (`ul.md:hidden`) are always display:none;
//  - its table (`div.overflow-x-auto`, hidden below `md`) is shown from `sm`;
//  - below `sm` the wrapper is a flex column so the compact card (order 2) sits
//    between the toolbar (order 1) and the pager card + shortcut bar (order 3).
// Selectors rely on DataTable's markup; the e2e phone/desktop specs cover it.
export function PhoneRowsShell({ rows, children }: { rows: ReactNode; children: ReactNode }) {
  return (
    <div className="max-sm:flex max-sm:flex-col max-sm:[&>*]:order-3 max-sm:[&>:first-child]:order-2 max-sm:[&>:nth-child(2)]:order-1 max-sm:[&_[role='combobox']]:min-h-11 [&_ul.divide-y:not([aria-label])]:hidden sm:[&_div.overflow-x-auto]:block">
      {rows}
      {children}
    </div>
  )
}

/** The single card of compact rows; `null` for no rows (DataTable shows its empty state). */
export function PhoneRows({ label, children }: { label: string; children: ReactNode[] }) {
  if (!children.length) return null
  return (
    <Card padded={false} className="mb-grid sm:hidden">
      <ul aria-label={label} className="divide-y divide-line">
        {children}
      </ul>
    </Card>
  )
}
