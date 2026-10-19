// Generic streamed skeleton (#301). Shown while a route's server queries resolve
// so the user sees structure instead of a blank wait. Reused by the super-admin /
// distributor / agent / gov loading.tsx.
export function PageSkeleton({ cards = 3, rows = 6, shimmer = false }: { cards?: number; rows?: number; shimmer?: boolean }) {
  return (
    <div className={`mx-auto w-full max-w-4xl p-6 ${shimmer ? 'ui-shimmer' : 'animate-pulse'}`} aria-hidden="true">
      <div className="mb-6 h-8 w-56 rounded bg-line-strong" />
      {cards > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="rounded-lg border border-line/70 bg-paper/92 p-5 shadow-card">
              <div className="h-7 w-16 rounded bg-line-strong" />
              <div className="mt-2 h-3 w-24 rounded bg-line" />
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3 rounded-lg border border-line/70 bg-paper/92 p-5 shadow-card">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-6 w-full rounded bg-line" />
        ))}
      </div>
    </div>
  )
}
