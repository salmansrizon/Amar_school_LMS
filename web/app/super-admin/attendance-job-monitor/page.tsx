import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { railClass } from '@/components/ui/page'
import { summarizeEvents, oldestQueuedMinutes, type DomainEventRow } from '@/lib/super-admin/job-monitor'

// Async job monitor (#271). Surfaces the health of the event-driven back-office:
// the domain-events dispatch queue and the attendance-tap processing backlog.
export default async function AttendanceJobMonitorPage() {
  const { supabase } = await getSuperAdminContext()

  const [pendingTaps, pendingEvents, stuckEvents, recent] = await Promise.all([
    supabase.from('attendance_events').select('id', { count: 'exact', head: true }).eq('processed', false),
    supabase.from('domain_events').select('id', { count: 'exact', head: true }).is('dispatched_at', null),
    supabase.from('domain_events').select('id', { count: 'exact', head: true }).is('dispatched_at', null).gte('attempts', 3),
    supabase
      .from('domain_events')
      .select('id, type, attempts, dispatched_at, occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(200),
  ])

  const events = (recent.data ?? []) as DomainEventRow[]
  const byType = summarizeEvents(events)
  // A queue depth alone does not say whether anything is wrong: 96 events queued
  // for six seconds is a dispatcher mid-run, 96 queued for six hours is one that
  // is not running. The page showed only the count, so the two looked identical.
  const waitingMinutes = oldestQueuedMinutes(events, new Date())

  const stats = [
    { label: 'Unprocessed taps', value: pendingTaps.count ?? 0, tone: 'text-sky-deep', rail: railClass('sky') },
    { label: 'Queued events', value: pendingEvents.count ?? 0, tone: 'text-sun-deep', rail: railClass('sun') },
    { label: 'Stuck (≥3 tries)', value: stuckEvents.count ?? 0, tone: 'text-alert-deep', rail: railClass('alert') },
    {
      label: 'Oldest queued',
      value: waitingMinutes === null ? '—' : waitingMinutes < 60 ? `${waitingMinutes}m` : `${Math.floor(waitingMinutes / 60)}h`,
      tone: waitingMinutes !== null && waitingMinutes > 60 ? 'text-alert-deep' : 'text-ink',
      rail: railClass(waitingMinutes !== null && waitingMinutes > 60 ? 'alert' : 'mint'),
    },
  ]

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Job Monitor</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-lg border border-line bg-paper p-5 ${s.rail}`}>
            <div className={`text-3xl font-extrabold ${s.tone}`}>{s.value}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </section>

      {/* One row per type, not per event. Fifty lines that differ only by
          timestamp tell an operator nothing and bury the one type that is stuck —
          which is what the UAT pass saw and read as a flood of repeats (#537). */}
      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">By event type</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4 text-right">Seen</th>
                <th className="py-2 pr-4 text-right">Queued</th>
                <th className="py-2 pr-4 text-right">Max tries</th>
                <th className="py-2 pr-4">Waiting since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {byType.map((t) => (
                <tr key={t.type}>
                  <td className={`py-2 pr-4 font-mono text-xs font-semibold ${railClass(t.queued ? 'sun' : 'mint')}`}>
                    {t.type}
                  </td>
                  <td className="py-2 pr-4 text-right">{t.total}</td>
                  <td className={`py-2 pr-4 text-right ${t.queued ? 'font-bold text-sun-deep' : 'text-muted'}`}>
                    {t.queued || '—'}
                  </td>
                  <td className={`py-2 pr-4 text-right ${t.maxAttempts >= 3 ? 'font-bold text-alert-deep' : ''}`}>
                    {t.queued ? t.maxAttempts : '—'}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted">
                    {t.oldestQueued ? new Date(t.oldestQueued).toLocaleString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
              {!byType.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No events recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Recent Domain Events</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Tries</th>
                <th className="py-2 pr-4">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={`py-2 pr-4 whitespace-nowrap text-muted ${railClass(e.dispatched_at ? 'mint' : 'sun')}`}>
                    {new Date(e.occurred_at).toLocaleString('en-GB')}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs font-semibold">{e.type}</td>
                  <td className="py-2 pr-4">{e.attempts}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.dispatched_at ? 'bg-mint-soft text-mint-deep' : 'bg-sun-soft text-sun-deep'}`}
                    >
                      {e.dispatched_at ? 'dispatched' : 'queued'}
                    </span>
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No events recorded.
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
