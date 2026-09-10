import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { loadSchoolSmsCredit, loadSchoolSmsLedger } from '@/lib/sms/credit'
import { SmsTabs } from './tabs'
import { ComposeForm } from './compose-form'
import { COMPOSE_STUDENT_COLUMNS, COMPOSE_EMPLOYEE_COLUMNS } from '@/lib/sms/recipients'

// Compose SMS (issue #36, PRD §5.7) per ui/school-owner/sms-compose.html.
// Recipients build from class/section, a teacher/staff/management
// group, or manual numbers; live character/segment counting client-side.
export default async function SmsComposePage() {
  const lang = await currentLang()
  const { supabase, schoolId } = await getSchoolContext()
  const smsCredit = await loadSchoolSmsCredit(supabase, schoolId)
  const smsLedger = smsCredit ? await loadSchoolSmsLedger(supabase, schoolId) : []

  // Withdrawn/archived students and employees are excluded — matches the
  // active-only default every other list screen in this app uses (e.g.
  // app/school/students/page.tsx, app/school/employees/page.tsx).
  //
  // The Class/Section picker options come from `class_offerings` now, not from
  // the distinct values of `students.class_name`/`section` (map #598 Wave 5,
  // #606): targeting resolves against a Student's current Enrollment's
  // Offering, so the picker must offer the Catalogue's own Offerings.
  const [{ data: students }, { data: employees }, { data: school }, { data: allOfferings }] = await Promise.all([
    supabase.from('students').select(COMPOSE_STUDENT_COLUMNS).is('archived_at', null),
    supabase.from('employee_card').select(COMPOSE_EMPLOYEE_COLUMNS).is('archived_at', null),
    supabase.from('schools').select('active_academic_year').eq('id', schoolId).maybeSingle(),
    supabase.from('class_offerings').select('id, name, section, group_department, shift, academic_year').order('name'),
  ])

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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sms.composeTitle', lang)}</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/school/sms/buy"
            className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t('sms.buyMore', lang)}
          </Link>
          <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        </div>
      </div>

      {smsCredit && (
        <div
          className={`mb-4 rounded-lg border p-4 ${
            smsCredit.level === 'empty'
              ? 'border-alert/40 bg-alert-soft/40'
              : smsCredit.level === 'low'
                ? 'border-sun-deep/30 bg-sun-soft'
                : 'border-line bg-paper'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">{t('sms.balance', lang)}</span>
            <span className="text-lg font-extrabold text-ink">
              {smsCredit.balance} <span className="text-xs font-medium text-muted">{t('sms.creditsLeft', lang)}</span>
            </span>
          </div>
          {smsCredit.level !== 'ok' && (
            <p className={`mt-1 text-xs font-semibold ${smsCredit.level === 'empty' ? 'text-alert-deep' : 'text-sun-deep'}`}>
              {t(smsCredit.level === 'empty' ? 'sms.balanceEmpty' : 'sms.lowBalance', lang)}
            </p>
          )}
          {smsLedger.length > 0 && (
            <ul className="mt-3 divide-y divide-line/60 border-t border-line/60 pt-1 text-xs">
              {smsLedger.map((e, i) => (
                <li key={`${e.created_at}-${i}`} className="flex items-center justify-between py-1">
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
          )}
        </div>
      )}

      <SmsTabs active="/school/sms" lang={lang} />

      <ComposeForm
        lang={lang}
        students={students ?? []}
        employees={employees ?? []}
        offerings={offerings}
        activeAcademicYear={activeAcademicYear}
        categories={categories}
      />
    </div>
  )
}
