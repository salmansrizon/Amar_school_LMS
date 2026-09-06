import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { classSectionLabel } from '@/lib/students'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { firstRelation } from '@/lib/supabase/relation'
import { TransferForm } from './transfer-form'

// Layout per ui/school-owner/student-transfer-modal.html: the transfer form
// (new class/section + optional note) above the full transfer-history
// table (Date | From | To | Reason).
//
// The history table reads student_enrollments, not student_transfers (Wave 6,
// issue #591 — student_transfers is dropped, its history-log job fully
// retired onto student_enrollments.note). Each enrollment row IS one "To"
// placement; its "From" is simply the previous row's own placement, so the
// table is built by pairing each row with the one immediately before it,
// oldest first, then reversed for newest-first display. The very first
// Enrollment a Student ever has (their original placement, including Wave 6's
// own backfill) has no "From" at all — nothing to show but the placement
// itself.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function StudentTransferPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection } = await getSchoolContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, roll_number, class_name, section')
    .eq('id', id)
    .single()
  if (!student) notFound()

  const [{ data: enrollments }, { data: classOfferings }] = await Promise.all([
    supabase
      .from('student_enrollments')
      .select('id, created_at, note, class_offerings(name, section, group_department, shift)')
      .eq('student_id', id)
      .order('created_at', { ascending: true }),
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section, group_department, shift').order('created_at'),
      shiftSelection,
    ),
  ])

  type EnrollmentRow = {
    id: string
    created_at: string
    note: string | null
    class_offerings: { name: string; section: string | null; group_department: string | null; shift: string | null }[]
  }
  const offeringOf = (row: EnrollmentRow) => firstRelation(row.class_offerings)
  const history = ((enrollments ?? []) as EnrollmentRow[]).map((row, i, all) => ({
    id: row.id,
    date: row.created_at,
    from: i === 0 ? null : offeringOf(all[i - 1]),
    to: offeringOf(row),
    reason: row.note,
  }))
  history.reverse() // newest first, for display

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const currentLabel = classSectionLabel(student.class_name, student.section)
  const headerBits = [
    student.roll_number !== null ? `${t('students.roll', lang)} ${student.roll_number}` : null,
    currentLabel,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.transferTitle', lang)}</h1>
        <Link href={`/school/students/${id}`} aria-label={t('students.backToProfile', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        {student.full_name}
        {headerBits ? ` (${headerBits})` : ''}
      </p>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <TransferForm lang={lang} studentId={id} classOfferings={classOfferings ?? []} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-4 font-bold">{t('students.transferHistory', lang)}</h2>
        {!history.length ? (
          <p className="text-sm text-muted">{t('students.noTransfers', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('students.transferDate', lang)}</th>
                  <th className={thClass}>{t('students.fromClassSection', lang)}</th>
                  <th className={thClass}>{t('students.toClassSection', lang)}</th>
                  <th className={thClass}>{t('students.reason', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line">
                    <td className={tdClass}>{new Date(h.date).toLocaleDateString(locale)}</td>
                    <td className={tdClass}>
                      {h.from ? classCatalogueLabel(h.from) : <span className="text-muted">—</span>}
                    </td>
                    <td className={tdClass}>
                      {h.to ? classCatalogueLabel(h.to) : <span className="text-muted">—</span>}
                    </td>
                    <td className={tdClass}>{h.reason ?? <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
