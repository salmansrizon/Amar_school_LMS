// Collapsible "add new" affordance (details/summary) shared by list pages
// whose mockup doesn't show an explicit add form (classes, feedback, ratings)
// but still need one wired to real data. Extracted from app/school/classes/page.tsx
// (issue #26) so issue #38's two feedback pages don't carry their own copies.
export function AddDetails({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
        {label}
      </summary>
      <div className="mt-3 rounded-md border border-line bg-paper-muted p-4">{children}</div>
    </details>
  )
}
