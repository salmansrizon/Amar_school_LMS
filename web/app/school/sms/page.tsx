import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ListChecks, MessageSquare, Wallet } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs, headerPrimary } from '@/lib/school-crumbs'
import { loadSchoolSmsCredit, loadSchoolSmsLedger } from '@/lib/sms/credit'
import { selectAllRows } from '@/lib/supabase/select-all'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid, WarningBanner } from '@/components/ui/widgets'
import { SmsTabs } from './tabs'
import { ComposeForm } from './compose-form'
import { COMPOSE_STUDENT_COLUMNS, COMPOSE_EMPLOYEE_COLUMNS } from '@/lib/sms/recipients'
import { pageTitle } from '@/lib/page-title'

// SMS Center (map 013 FC2, new_ui/04-finance-communication/sms-center): header,
// credit alert, stat cards (balance / sent today / failed today / active rules),
// quick actions, then Compose (issue #36, PRD §5.7) unchanged.
//
// `?students=<id,id,…>` prefills Compose with those Students' guardian mobiles
// in Manual Numbers mode — the students list's "Remind" row action for a due or
// partial Monthly Fee Standing. It reuses the existing manual send path; no new
// sending logic.

// ponytail: cap on prefilled ids; a URL this long is already near browser limits.
const PREFILL_MAX = 200

export const generateMetadata = pageTitle('sms.centerTitle')

export default async function SmsComposePage({ searchParams }: { searchParams: Promise<{ students?: string }> }) {
  const { students: prefillParam = '' } = await searchParams
  const lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase, schoolId } = await getSchoolContext()
  const today = new Date().toISOString().slice(0, 10)
  const prefillIds = [...new Set(prefillParam.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, PREFILL_MAX)

  // Withdrawn/archived students and employees are excluded — matches the
  // active-only default every other list screen in this app uses (e.g.
  // app/school/students/page.tsx, app/school/employees/page.tsx).
  //
  // The Class/Section picker options come from `class_offerings` now, not from
  // the distinct values of `students.class_name`/`section` (map #598 Wave 5,
  // #606): targeting resolves against a Student's current Enrollment's
  // Offering, so the picker must offer the Catalogue's own Offerings.
  const [
    smsCredit,
    { rows: students },
    { data: employees },
    { data: school },
    { data: allOfferings },
    { count: sentToday },
    { count: failedToday },
    { count: ruleCount },
    prefill,
  ] = await Promise.all([
    loadSchoolSmsCredit(supabase, schoolId),
    selectAllRows((from, to) =>
      supabase.from('students').select(COMPOSE_STUDENT_COLUMNS).is('archived_at', null).order('id').range(from, to),
    ),
    supabase.from('employee_card').select(COMPOSE_EMPLOYEE_COLUMNS).is('archived_at', null),
    supabase.from('schools').select('active_academic_year').eq('id', schoolId).maybeSingle(),
    supabase.from('class_offerings').select('id, name, section, group_department, shift, academic_year').order('name'),
    supabase.from('sms_log').select('*', { count: 'exact', head: true }).eq('sent_on', today),
    supabase.from('sms_log').select('*', { count: 'exact', head: true }).eq('sent_on', today).eq('status', 'failed'),
    supabase.from('absence_sms_rules').select('*', { count: 'exact', head: true }),
    prefillIds.length
      ? supabase.from('students').select('id, guardian_phone').in('id', prefillIds)
      : Promise.resolve({ data: [] as { id: string; guardian_phone: string | null }[] }),
  ])
  const smsLedger = smsCredit ? await loadSchoolSmsLedger(supabase, schoolId) : []
  // A school that is not on prepaid metering has no level to warn about, but
  // the owner is still promised a balance: it reads 0 (no credit record) with a
  // note that sends are not deducted, instead of the card vanishing.
  const smsBalance = smsCredit
    ? smsCredit.balance
    : Number((await supabase.rpc('sms_balance_for', { sid: schoolId })).data ?? 0)

  const prefillPhones = (prefill.data ?? []).map((s) => s.guardian_phone?.trim()).filter((p): p is string => !!p)
  const prefillMissing = prefillIds.length - prefillPhones.length

  const activeAcademicYear = school?.active_academic_year ?? null
  // Only the active-year Offerings can have current Enrollments pointing at
  // them, so a past-year Offering in the picker resolves to zero recipients
  // and — since the Catalogue label omits the year — is indistinguishable
  // from the current one. Drop them (keep all only when no year is set yet).
  //
  // Deliberately NOT wired to the Global Academic Year Selection (map #609,
  // T6/#615): that is a browse/management visibility preference. SMS targeting
  // stays pinned to `active_academic_year` by business rule.
  const offerings = (allOfferings ?? []).filter(
    (o) => activeAcademicYear === null || o.academic_year === activeAcademicYear,
  )
  const categories = [...new Set((employees ?? []).map((e) => e.category).filter(Boolean))] as string[]

  return (
    <>
      <PageHeader
        title={t('sms.centerTitle', lang)}
        subtitle={t('sms.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/sms', lang, [{ label: t('sms.centerTitle', lang) }])}
        actions={
          <Link href="/school/sms/buy" className={headerPrimary}>
            {t('sms.buyMore', lang)}
          </Link>
        }
      />

      {smsCredit && smsCredit.level !== 'ok' && (
        <WarningBanner
          label={t('fees.attention', lang)}
          text={t(smsCredit.level === 'empty' ? 'sms.balanceEmpty' : 'sms.lowBalance', lang)}
          href="/school/sms/buy"
          linkLabel={t('sms.buyMore', lang)}
        />
      )}

      <StatGrid>
        <StatCard
          icon={<Wallet className="size-5" />}
          tone={!smsCredit ? 'muted' : smsCredit.level === 'ok' ? 'brand' : smsCredit.level === 'empty' ? 'alert' : 'sun'}
          label={t('sms.balance', lang)}
          value={fmt.format(smsBalance)}
          note={t(smsCredit ? 'sms.creditsLeft' : 'sms.balanceUnmetered', lang)}
          action={{ href: '/school/sms/buy', label: t('sms.buyMore', lang) }}
        />
        <StatCard
          icon={<MessageSquare className="size-5" />}
          tone="mint"
          label={t('sms.statSentToday', lang)}
          value={fmt.format(sentToday ?? 0)}
          action={{ href: '/school/sms/log', label: t('sms.viewLog', lang) }}
        />
        <StatCard
          icon={(failedToday ?? 0) > 0 ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
          tone={(failedToday ?? 0) > 0 ? 'alert' : 'mint'}
          label={t('sms.statFailedToday', lang)}
          value={fmt.format(failedToday ?? 0)}
          action={{ href: '/school/sms/log?status=failed', label: t('sms.viewLog', lang) }}
        />
        <StatCard
          icon={<ListChecks className="size-5" />}
          tone="sky"
          label={t('sms.statRules', lang)}
          value={fmt.format(ruleCount ?? 0)}
          action={{ href: '/school/sms/rules', label: t('sms.manageRules', lang) }}
        />
      </StatGrid>

      <SmsTabs active="/school/sms" lang={lang} />

      {prefillIds.length > 0 && (
        <Card className="mb-grid">
          <p className="text-sm font-semibold">
            {t('sms.prefilled', lang)}: {fmt.format(prefillPhones.length)}
          </p>
          {prefillMissing > 0 && (
            <p className="mt-1 text-xs text-sun-deep">
              {fmt.format(prefillMissing)} {t('sms.prefillMissing', lang)}
            </p>
          )}
        </Card>
      )}

      <div id="compose">
        <ComposeForm
          lang={lang}
          students={students}
          employees={employees ?? []}
          offerings={offerings}
          activeAcademicYear={activeAcademicYear}
          categories={categories}
          prefillNumbers={prefillIds.length ? prefillPhones.join(', ') : undefined}
          balance={smsBalance}
          metered={smsCredit !== null}
        />
      </div>

      {smsLedger.length > 0 && (
        <Card className="mt-section">
          <h2 className="mb-2 font-bold">{t('sms.ledger', lang)}</h2>
          <ul className="divide-y divide-line text-sm">
            {smsLedger.map((e, i) => (
              <li key={`${e.created_at}-${i}`} className="flex items-center justify-between py-2">
                <span className="text-muted">
                  {t(
                    e.reason === 'topup' ? 'sa.sms.reasonTopup' : e.reason === 'send' ? 'sa.sms.reasonSend' : 'sa.sms.reasonAdjust',
                    lang,
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`font-bold ${e.delta < 0 ? 'text-alert-deep' : 'text-mint-deep'}`}>
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                  <span className="text-muted">{e.created_at.slice(0, 10)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
