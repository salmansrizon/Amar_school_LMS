import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AssignCardForm, RemoveCardButton } from './card-controls'

export default async function AttendancePage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: school }, { data: cards }, { data: students }, { data: employees }, { data: records }] =
    await Promise.all([
      supabase.from('schools').select('ingest_token').eq('id', me.school_id).single(),
      supabase
        .from('rfid_cards')
        .select('id, card_number, students(full_name), employees(full_name)')
        .order('card_number'),
      supabase.from('students').select('id, full_name').order('full_name'),
      supabase.from('employees').select('id, full_name').order('full_name'),
      supabase
        .from('attendance_records')
        .select('id, person_type, person_id, att_date, entry_at, exit_at, status')
        .order('att_date', { ascending: false })
        .limit(50),
    ])

  // person_id is polymorphic (student or employee) — resolve names locally.
  const names = new Map<string, string>([
    ...(students ?? []).map((s) => [s.id, s.full_name] as [string, string]),
    ...(employees ?? []).map((e) => [e.id, e.full_name] as [string, string]),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-2 font-bold">{t('attendance.cards', lang)}</h2>
        <p className="mb-3 break-all rounded-md bg-paper-muted px-3 py-2 text-xs text-muted">
          {t('attendance.ingestInfo', lang)}
          <br />
          <code className="font-mono">
            POST /api/attendance/ingest/{me.school_id} · x-ingest-token: {school?.ingest_token}
          </code>
        </p>
        <AssignCardForm students={students ?? []} employees={employees ?? []} lang={lang} />
        <ul className="mt-3 divide-y divide-line">
          {cards?.map((card) => (
            <li key={card.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-mono font-semibold">{card.card_number}</span>
                <span className="ml-2 text-muted">
                  {(card.students as unknown as { full_name: string } | null)?.full_name ??
                    (card.employees as unknown as { full_name: string } | null)?.full_name}
                </span>
              </span>
              <RemoveCardButton id={card.id} label={t('attendance.remove', lang)} />
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('attendance.records', lang)}</h2>
        {!records?.length && <p className="text-sm text-muted">{t('attendance.none', lang)}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase text-muted">
              <th className="py-2">{t('attendance.date', lang)}</th>
              <th className="py-2">{t('attendance.holder', lang)}</th>
              <th className="py-2">{t('attendance.entry', lang)}</th>
              <th className="py-2">{t('attendance.exit', lang)}</th>
              <th className="py-2">{t('codes.status', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {records?.map((r) => (
              <tr key={r.id}>
                <td className="py-2">{r.att_date}</td>
                <td className="py-2">{names.get(r.person_id) ?? r.person_type}</td>
                <td className="py-2">{new Date(r.entry_at).toISOString().slice(11, 16)}</td>
                <td className="py-2">
                  {r.exit_at ? new Date(r.exit_at).toISOString().slice(11, 16) : '—'}
                </td>
                <td className="py-2">
                  <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold">
                    {t(`status.${r.status}` as 'status.present', lang)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
