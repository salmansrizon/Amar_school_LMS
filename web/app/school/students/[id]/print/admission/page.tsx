import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, InstituteHeader, InfoGrid, SignatureRow, QrFooterRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'

// Printable admission form (issue #46, PRD §5.1: "Printable admission/ID
// templates"). ADR 0007: browser-native print, composed from the shared
// pieces — same pattern as the routine printable (#45). Fields are whatever
// the admission profile (#27) has filled in; a dash covers the rest.

const dash = '—'

export default async function AdmissionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [institute, { data: student }] = await Promise.all([
    loadInstitutePrintHeader(supabase, lang),
    supabase
      .from('students')
      .select(
        'full_name, class_name, section, roll_number, gender, date_of_birth, blood_group, religion, student_mobile, village, union_name, upazila, district, guardian_name, guardian_relation, guardian_mobile, previous_institute, previous_class',
      )
      .eq('id', id)
      .maybeSingle(),
  ])
  if (!institute || !student) notFound()

  const v = (x: string | number | null | undefined) => (x === null || x === undefined || x === '' ? dash : x)
  const address = [student.village, student.union_name, student.upazila, student.district]
    .filter(Boolean)
    .join(', ')

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/school/students/${id}`} aria-label={t('students.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <InstituteHeader institute={institute ?? undefined} docTitle={t('students.printAdmission', lang)} />

        <InfoGrid
          rows={[
            { label: t('students.name', lang), value: student.full_name },
            { label: t('classes.class', lang), value: `${v(student.class_name)} ${student.section ?? ''}`.trim() },
            { label: t('students.roll', lang), value: v(student.roll_number) },
            { label: t('students.gender', lang), value: v(student.gender) },
            { label: t('students.dob', lang), value: v(student.date_of_birth) },
            { label: t('students.bloodGroup', lang), value: v(student.blood_group) },
            { label: t('students.religion', lang), value: v(student.religion) },
            { label: t('students.mobile', lang), value: v(student.student_mobile) },
            { label: t('students.address', lang), value: address || dash },
            { label: t('students.guardianName', lang), value: v(student.guardian_name) },
            { label: t('students.guardianRelation', lang), value: v(student.guardian_relation) },
            { label: t('students.guardianMobile', lang), value: v(student.guardian_mobile) },
            { label: t('students.previousInstitute', lang), value: v(student.previous_institute) },
            { label: t('students.previousClass', lang), value: v(student.previous_class) },
          ]}
        />

        <SignatureRow labels={[t('students.sigGuardian', lang), t('students.sigPrincipal', lang)]} />
        <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
      </PrintPage>
    </main>
  )
}
