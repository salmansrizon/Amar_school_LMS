import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { extractPlaceholders } from '@/lib/super-admin/notification-templates'
import {
  TemplateForm,
  DeleteTemplateButton,
  ChannelRouteForm,
  RemoveRouteButton,
} from './notification-forms'

type JsonText = { en?: string; bn?: string } | null
const en = (x: JsonText, fallback: string) => x?.en ?? fallback

// Notification templates + channel routing (#292 CRUD, over #271 viewer).
// Create/edit/delete templates + add/remove event→channel→template routes.
export default async function NotificationsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: templates }, { data: channelMap }] = await Promise.all([
    supabase.from('notification_templates').select('key, title, body').order('key'),
    supabase.from('notification_channel_map').select('event_type, channel, template_key').order('event_type'),
  ])

  const routesByTemplate = new Map<string, { event_type: string; channel: string }[]>()
  for (const c of channelMap ?? []) {
    routesByTemplate.set(c.template_key, [...(routesByTemplate.get(c.template_key) ?? []), c])
  }
  const templateKeys = (templates ?? []).map((t) => t.key)

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Notification Templates</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Add / update a template</h2>
        <TemplateForm />
      </section>

      <div className="mb-6 space-y-4">
        {templates?.map((t) => {
          const placeholders = extractPlaceholders(en(t.title as JsonText, ''), en(t.body as JsonText, ''))
          return (
            <section key={t.key} className="rounded-lg border border-line bg-paper p-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="font-bold">{en(t.title as JsonText, t.key)}</h2>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted">{t.key}</span>
                  <DeleteTemplateButton templateKey={t.key} />
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted">{en(t.body as JsonText, '')}</p>
              {placeholders.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {placeholders.map((p) => (
                    <span key={p} className="rounded bg-paper-muted px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {`{{${p}}}`}
                    </span>
                  ))}
                </div>
              )}
              {routesByTemplate.get(t.key)?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {routesByTemplate.get(t.key)!.map((r) => (
                    <span
                      key={`${r.event_type}:${r.channel}`}
                      className="flex items-center gap-1.5 rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep"
                    >
                      {r.event_type} · {r.channel}
                      <RemoveRouteButton eventType={r.event_type} channel={r.channel} />
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">Not routed to any event.</p>
              )}
            </section>
          )
        })}
        {!templates?.length && <p className="text-sm text-muted">No templates defined.</p>}
      </div>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Route an event to a template</h2>
        <ChannelRouteForm templateKeys={templateKeys} />
      </section>
    </main>
  )
}
