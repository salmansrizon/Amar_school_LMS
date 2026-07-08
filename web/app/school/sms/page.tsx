import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddOffDayForm, DeleteOffDayButton, AddRuleForm, DeleteRuleButton, AddLeaveForm, DeleteLeaveButton } from './sms-controls'

export default async function SmsPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [offDays, rules, logResult, students, leaves] = await Promise.all([
    supabase.from('off_days').select('day, label').order('day', { ascending: false }).limit(100),
    supabase.from('absence_sms_rules').select('id, exact_days, range_from, range_to').order('created_at'),
    supabase
      .from('sms_log')
      .select('id, sent_on, student_id, phone, body, provider')
      .order('sent_on', { ascending: false })
      .limit(50),
    supabase.from('students').select('id, full_name').order('full_name'),
    supabase
      .from('student_leaves')
      .select('id, student_id, from_day, to_day')
      .order('from_day', { ascending: false })
      .limit(100),
  ])

  const names = new Map((students.data ?? []).map((s) => [s.id, s.full_name]))

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sms.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      {/* Off days */}
      <section className="mb-8 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">{t('sms.offDays', lang)}</h2>
        <AddOffDayForm lang={lang} />
        {offDays.data?.length ? (
          <ul className="space-y-1 text-sm">
            {offDays.data.map((od) => (
              <li key={od.day} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5">
                <span>{od.day}{od.label ? ` — ${od.label}` : ''}</span>
                <DeleteOffDayButton day={od.day} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{t('locations.empty', lang)}</p>
        )}
      </section>

      {/* Absence SMS rules */}
      <section className="mb-8 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">{t('sms.rules', lang)}</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <AddRuleForm lang={lang} ruleType="exact" />
          <AddRuleForm lang={lang} ruleType="range" />
        </div>
        {rules.data?.length ? (
          <ul className="space-y-1 text-sm">
            {rules.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5">
                <span>
                  {r.exact_days
                    ? `= ${r.exact_days} ${t('sms.days', lang)}`
                    : `${r.range_from}–${r.range_to} ${t('sms.days', lang)}`}
                </span>
                <DeleteRuleButton id={r.id} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{t('locations.empty', lang)}</p>
        )}
      </section>

      {/* Student leaves */}
      <section className="mb-8 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">{t('sms.leaves', lang)}</h2>
        <AddLeaveForm lang={lang} students={students.data ?? []} />
        {leaves.data?.length ? (
          <ul className="space-y-1 text-sm">
            {leaves.data.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5">
                <span>
                  {names.get(l.student_id) ?? '—'} — {l.from_day} → {l.to_day}
                </span>
                <DeleteLeaveButton id={l.id} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{t('locations.empty', lang)}</p>
        )}
      </section>

      {/* SMS log */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">{t('sms.log', lang)}</h2>
        {logResult.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-2 py-1">{t('sms.sentOn', lang)}</th>
                  <th className="px-2 py-1">{t('sms.student', lang)}</th>
                  <th className="px-2 py-1">{t('sms.phone', lang)}</th>
                  <th className="px-2 py-1">{t('sms.body', lang)}</th>
                  <th className="px-2 py-1">{t('sms.provider', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {logResult.data.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="px-2 py-1">{row.sent_on}</td>
                    <td className="px-2 py-1">{names.get(row.student_id ?? '') ?? '—'}</td>
                    <td className="px-2 py-1">{row.phone ?? '—'}</td>
                    <td className="px-2 py-1 text-xs">{row.body}</td>
                    <td className="px-2 py-1">{row.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('sms.log', lang)}</p>
        )}
      </section>
    </main>
  )
}