import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { railClass } from '@/components/ui/page'

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
      .limit(50),
  ])

  const stats = [
    { label: 'Unprocessed taps', value: pendingTaps.count ?? 0, tone: 'text-sky-deep', rail: railClass('sky') },
    { label: 'Queued events', value: pendingEvents.count ?? 0, tone: 'text-sun-deep', rail: railClass('sun') },
    { label: 'Stuck (≥3 tries)', value: stuckEvents.count ?? 0, tone: 'text-alert-deep', rail: railClass('alert') },
  ]

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Job Monitor</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-lg border border-line bg-paper p-5 ${s.rail}`}>
            <div className={`text-3xl font-extrabold ${s.tone}`}>{s.value}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </div>
        ))}
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
              {recent.data?.map((e) => (
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
              {!recent.data?.length && (
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
