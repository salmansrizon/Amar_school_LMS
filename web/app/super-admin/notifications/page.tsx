import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'

type JsonText = { en?: string; bn?: string } | null
const en = (x: JsonText, fallback: string) => x?.en ?? fallback

// Notification templates + channel routing (#271 / notification engine 0089).
// Shows each template and which event/channel pairs resolve to it.
export default async function NotificationsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: templates }, { data: channelMap }] = await Promise.all([
    supabase.from('notification_templates').select('key, title, body').order('key'),
    supabase.from('notification_channel_map').select('event_type, channel, template_key').order('event_type'),
  ])

  const routesByTemplate = new Map<string, string[]>()
  for (const c of channelMap ?? []) {
    routesByTemplate.set(c.template_key, [
      ...(routesByTemplate.get(c.template_key) ?? []),
      `${c.event_type} · ${c.channel}`,
    ])
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Notification Templates</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="space-y-4">
        {templates?.map((t) => (
          <section key={t.key} className="rounded-lg border border-line bg-paper p-5 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-bold">{en(t.title as JsonText, t.key)}</h2>
              <span className="font-mono text-xs text-muted">{t.key}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted">{en(t.body as JsonText, '')}</p>
            {routesByTemplate.get(t.key)?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {routesByTemplate.get(t.key)!.map((r) => (
                  <span key={r} className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                    {r}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">Not routed to any event.</p>
            )}
          </section>
        ))}
        {!templates?.length && <p className="text-sm text-muted">No templates defined.</p>}
      </div>
    </main>
  )
}
