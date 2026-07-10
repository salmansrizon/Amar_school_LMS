import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classShiftLabel } from '@/lib/students'
import { TransferForm } from './transfer-form'

// Layout per ui/school-owner/student-transfer-modal.html: the transfer form
// (new class/section/shift + optional note) above the full transfer-history
// table (Date | From | To | Reason).

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function StudentTransferPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, roll_number, class_name, section, shift_id')
    .eq('id', id)
    .single()
  if (!student) notFound()

  const [{ data: transfers }, { data: classes }, { data: shifts }] = await Promise.all([
    supabase
      .from('student_transfers')
      .select('id, from_class, from_section, from_shift_id, to_class, to_section, to_shift_id, note, transferred_at')
      .eq('student_id', id)
      .order('transferred_at', { ascending: false }),
    supabase.from('classes').select('name, section').order('created_at'),
    supabase.from('shifts').select('id, name').order('created_at'),
  ])

  const shiftName = (shiftId: string | null) => shifts?.find((s) => s.id === shiftId)?.name ?? null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const currentLabel = classShiftLabel(student.class_name, student.section, shiftName(student.shift_id))
  const headerBits = [
    student.roll_number !== null ? `${t('students.roll', lang)} ${student.roll_number}` : null,
    currentLabel,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.transferTitle', lang)}</h1>
        <Link href={`/school/students/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {t('students.backToProfile', lang)}
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        {student.full_name}
        {headerBits ? ` (${headerBits})` : ''}
      </p>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <TransferForm
          lang={lang}
          studentId={id}
          classes={classes ?? []}
          shifts={shifts ?? []}
          currentClass={student.class_name}
          currentSection={student.section}
          currentShiftId={student.shift_id}
        />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-4 font-bold">{t('students.transferHistory', lang)}</h2>
        {!transfers?.length ? (
          <p className="text-sm text-muted">{t('students.noTransfers', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('students.transferDate', lang)}</th>
                  <th className={thClass}>{t('students.fromClassSectionShift', lang)}</th>
                  <th className={thClass}>{t('students.toClassSectionShift', lang)}</th>
                  <th className={thClass}>{t('students.reason', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.id} className="border-b border-line">
                    <td className={tdClass}>{new Date(tr.transferred_at).toLocaleDateString(locale)}</td>
                    <td className={tdClass}>
                      {classShiftLabel(tr.from_class, tr.from_section, shiftName(tr.from_shift_id)) ?? (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {classShiftLabel(tr.to_class, tr.to_section, shiftName(tr.to_shift_id)) ?? (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={tdClass}>{tr.note ?? <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
