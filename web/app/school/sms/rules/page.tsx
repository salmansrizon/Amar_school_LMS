import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { SmsTabs } from '../tabs'
import { AddOffDayForm, DeleteOffDayButton, AddRuleForm, DeleteRuleButton, AddLeaveForm, DeleteLeaveButton } from '../sms-controls'

// Absence SMS Rules (issue #12, already shipped) — moved under the SMS tab
// strip alongside the new Compose/Log screens (issue #36, PRD §5.7). Off-day
// calendar, exact/range rules, and student leave management are unchanged.
export default async function SmsRulesPage() {
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

  const [offDays, rules, students, leaves] = await Promise.all([
    supabase.from('off_days').select('day, label').order('day', { ascending: false }).limit(100),
    supabase.from('absence_sms_rules').select('id, exact_days, range_from, range_to').order('created_at'),
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
        <h1 className="text-2xl font-extrabold">{t('sms.rules', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <SmsTabs active="/school/sms/rules" lang={lang} />

      {/* Off days */}
      <section className="mb-8 rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card backdrop-blur">
        <h2 className="mb-3 text-lg font-bold">{t('sms.offDays', lang)}</h2>
        <AddOffDayForm lang={lang} />
        {offDays.data?.length ? (
          <ul className="space-y-1 text-sm">
            {offDays.data.map((od) => (
              <li key={od.day} className="flex items-center justify-between rounded bg-paper-muted px-3 py-1.5">
                <span>{od.day}{od.label ? ` — ${od.label}` : ''}</span>
                <DeleteOffDayButton day={od.day} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('locations.empty', lang)}</p>
        )}
      </section>

      {/* Absence SMS rules */}
      <section className="mb-8 rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card backdrop-blur">
        <h2 className="mb-3 text-lg font-bold">{t('sms.rules', lang)}</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <AddRuleForm lang={lang} ruleType="exact" />
          <AddRuleForm lang={lang} ruleType="range" />
        </div>
        {rules.data?.length ? (
          <ul className="space-y-1 text-sm">
            {rules.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded bg-paper-muted px-3 py-1.5">
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
          <p className="text-sm text-muted">{t('locations.empty', lang)}</p>
        )}
      </section>

      {/* Student leaves */}
      <section className="rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card backdrop-blur">
        <h2 className="mb-3 text-lg font-bold">{t('sms.leaves', lang)}</h2>
        <AddLeaveForm lang={lang} students={students.data ?? []} />
        {leaves.data?.length ? (
          <ul className="space-y-1 text-sm">
            {leaves.data.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded bg-paper-muted px-3 py-1.5">
                <span>
                  {names.get(l.student_id) ?? '—'} — {l.from_day} → {l.to_day}
                </span>
                <DeleteLeaveButton id={l.id} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('locations.empty', lang)}</p>
        )}
      </section>
    </main>
  )
}
