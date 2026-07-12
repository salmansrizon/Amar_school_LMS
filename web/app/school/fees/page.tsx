import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AccountingTabs } from './accounting-tabs'
import { FeeForm, type CollectStudent, type ExistingFeeRecord } from './fee-form'

// Layout per ui/school-owner/fee-collection.html: toolbar (search + Class +
// Month filters) over a roster table (Roll | Name | Class/Section | Month |
// Status | Action), a duplicate-record notice, and the collection form for
// the selected Student. One Fee Collection Record per Student per month is
// DB-enforced (0016/#11) — deepened here with the Fee/Fine/Scholarship split.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
const selectClass = 'rounded-md border border-line bg-paper px-3 py-1.5 text-sm'

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; month?: string; year?: string; student?: string }>
}) {
  const now = new Date()
  const {
    class: selectedClass = '',
    month: monthParam,
    year: yearParam,
    student: selectedStudent = '',
  } = await searchParams
  const month = Number(monthParam) || now.getMonth() + 1
  const year = Number(yearParam) || now.getFullYear()

  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: recentRecords }] = await Promise.all([
    supabase.from('classes').select('id, name, section').order('created_at'),
    supabase
      .from('fee_collection_records')
      .select(
        'id, month, year, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, students(full_name)',
      )
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const cls = classes?.find((c) => c.id === selectedClass) ?? null

  let roster: CollectStudent[] = []
  let recordMap = new Map<string, ExistingFeeRecord>()
  let prescribedFee = 0
  let finePerDay = 0

  if (cls) {
    const studentsQuery = supabase
      .from('students')
      .select('id, full_name, roll_number, class_name, section')
      .eq('class_name', cls.name)
      .is('archived_at', null)
      .order('roll_number')
    const [{ data: students }, { data: structure }] = await Promise.all([
      cls.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null),
      supabase
        .from('fee_structures')
        .select('amount, fine_per_absent_day')
        .eq('class_id', cls.id)
        .eq('academic_year', year)
        .eq('fee_type', 'monthly')
        .maybeSingle(),
    ])
    roster = students ?? []
    prescribedFee = Number(structure?.amount ?? 0)
    finePerDay = Number(structure?.fine_per_absent_day ?? 0)

    if (roster.length) {
      const { data: records } = await supabase
        .from('fee_collection_records')
        .select('id, student_id, pay_amount, fine_amount, adjust_amount, payment_method, note')
        .eq('month', month)
        .eq('year', year)
        .in(
          'student_id',
          roster.map((s) => s.id),
        )
      recordMap = new Map(
        (records ?? []).map((r) => [
          r.student_id,
          {
            id: r.id,
            pay_amount: Number(r.pay_amount),
            fine_amount: Number(r.fine_amount),
            adjust_amount: Number(r.adjust_amount),
            payment_method: r.payment_method,
            note: r.note,
          },
        ]),
      )
    }
  }

  const selectedRow = roster.find((s) => s.id === selectedStudent) ?? null
  const selectedExisting = selectedStudent ? (recordMap.get(selectedStudent) ?? null) : null

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('fees.tabCollection', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <AccountingTabs active="collection" lang={lang} />

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <select name="class" defaultValue={selectedClass} className={selectClass}>
          <option value="">{t('fees.allClasses', lang)}</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` - ${c.section}` : ''}
            </option>
          ))}
        </select>
        <select name="month" defaultValue={String(month)} className={selectClass}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          name="year"
          type="number"
          min={2000}
          max={2100}
          defaultValue={year}
          className={`${selectClass} w-24`}
        />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('classes.filter', lang)}
        </button>
      </form>

      <section className="mb-6 overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        {!cls ? (
          <p className="text-sm text-muted">{t('fees.pickClassPrompt', lang)}</p>
        ) : !roster.length ? (
          <p className="text-sm text-muted">{t('fees.noStudentsInClass', lang)}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('students.roll', lang)}</th>
                <th className={thClass}>{t('students.name', lang)}</th>
                <th className={thClass}>{t('students.classSection', lang)}</th>
                <th className={thClass}>{t('fees.month', lang)}</th>
                <th className={thClass}>{t('fees.status', lang)}</th>
                <th className={thClass}>{t('fees.action', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const collected = recordMap.has(s.id)
                const href = `/school/fees?class=${selectedClass}&month=${month}&year=${year}&student=${s.id}#collect-form`
                return (
                  <tr key={s.id} className="border-b border-line">
                    <td className={tdClass}>{s.roll_number ?? '—'}</td>
                    <td className={`${tdClass} font-medium`}>{s.full_name}</td>
                    <td className={tdClass}>{[s.class_name, s.section].filter(Boolean).join(' / ')}</td>
                    <td className={tdClass}>
                      {month}/{year}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          collected ? 'bg-mint-soft text-mint-deep' : 'bg-sun-soft text-sun-deep'
                        }`}
                      >
                        {t(collected ? 'fees.collected' : 'fees.notCollected', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Link
                        href={href}
                        className={
                          collected
                            ? 'rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted'
                            : 'rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600'
                        }
                      >
                        {t(collected ? 'fees.editRecord' : 'fees.collectAction', lang)}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {selectedRow && (
        <>
          {selectedExisting && (
            <div className="mb-4 rounded-lg border border-sun-deep/30 bg-sun-soft p-4">
              <p className="text-xs text-sun-deep">{t('fees.duplicateNote', lang)}</p>
            </div>
          )}
          <section id="collect-form" className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
            <FeeForm
              student={selectedRow}
              month={month}
              year={year}
              existingRecord={selectedExisting}
              prescribedFee={prescribedFee}
              finePerDay={finePerDay}
              lang={lang}
            />
          </section>
        </>
      )}

      <section className="overflow-x-auto rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('fees.records', lang)}</h2>
        {!recentRecords?.length && <p className="text-sm text-muted">{t('fees.none', lang)}</p>}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {recentRecords?.map((r) => (
              <tr key={r.id}>
                <td className="py-2 font-medium">
                  {(r.students as unknown as { full_name: string } | null)?.full_name}
                </td>
                <td className="py-2 text-muted">
                  {r.month}/{r.year}
                </td>
                <td className="py-2">৳{Number(r.pay_amount)}</td>
                <td className="py-2 text-muted">
                  {t('fees.due', lang)}: ৳{Number(r.due_amount)}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={`/school/fees/receipt/${r.id}`}
                    className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                  >
                    {t('fees.receipt', lang)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
