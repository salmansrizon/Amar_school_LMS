// Streamed instantly while the dashboard's server queries resolve, so the user
// sees the page structure immediately instead of a blank blocking wait. Mirrors
// the real layout (KPI row + activity/quick-actions split) to avoid layout officeTime.
export default function SchoolLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="mb-6">
        <div className="h-3 w-24 rounded bg-line" />
        <div className="mt-2 h-8 w-64 rounded bg-line-strong" />
        <div className="mt-2 h-3 w-32 rounded bg-line" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card">
            <div className="flex items-start justify-between">
              <div className="h-3 w-20 rounded bg-line" />
              <div className="size-9 rounded-xl bg-line" />
            </div>
            <div className="mt-4 h-8 w-16 rounded bg-line-strong" />
            <div className="mt-2 h-3 w-24 rounded bg-line" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 h-3 w-32 rounded bg-line" />
          <div className="space-y-3 rounded-2xl border border-line/70 bg-paper/92 p-4 shadow-card">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 w-full rounded bg-line" />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-3 h-3 w-24 rounded bg-line" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 w-full rounded-xl bg-line" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
