import { t, type Lang } from '@/lib/i18n'
import type { InstitutePrintHeader } from '@/lib/institute-print'
import { firstRelation } from '@/lib/supabase/relation'
import { studentClassLabel } from '@/lib/students'

// One printable Student ID card (issue #46, PRD §5.1), shared by the single
// card page and the directory's bulk print (map 013). ADR 0007: browser print.

// Class and roll come from the current Enrollment (map #568): the legacy
// class_name/section/roll_number columns on students are no longer kept current.
export const ID_CARD_COLUMNS = `id, full_name, class_name, section, roll_number, blood_group, guardian_mobile, public_token,
  student_enrollments!students_current_enrollment_id_fkey(roll_number, class_offerings(name, section))`

type EnrollmentEmbed = { roll_number: number | null; class_offerings: { name: string; section: string | null } | { name: string; section: string | null }[] | null }

export type IdCardStudent = {
  id: string
  full_name: string
  class_name: string | null
  section: string | null
  roll_number: number | null
  blood_group: string | null
  guardian_mobile: string | null
  public_token: string
  student_enrollments?: EnrollmentEmbed | EnrollmentEmbed[] | null
}

const dash = '—'

export function StudentIdCard({
  institute,
  student,
  qrSvg,
  lang,
}: {
  institute: InstitutePrintHeader
  student: IdCardStudent
  qrSvg: string
  lang: Lang
}) {
  const v = (x: string | number | null | undefined) => (x === null || x === undefined || x === '' ? dash : x)
  const enrollment = firstRelation(student.student_enrollments)
  const offering = enrollment ? firstRelation(enrollment.class_offerings) : null
  const className = offering?.name ?? student.class_name
  const section = offering ? offering.section : student.section
  const roll = enrollment ? enrollment.roll_number : student.roll_number
  return (
  <div className="mx-auto w-full max-w-80 rounded-lg border-2 border-brand-500 p-4 text-center">
    {/* An ID card is 80mm wide: the full institution block (address,
        contacts, codes) would swamp it, so the chrome here is the logo
        and the name — deliberately the one exception to the sweep. */}
    {institute.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={institute.logoUrl} alt="" className="mx-auto mb-1 h-10 w-auto object-contain" />
    ) : null}
    <div className="mb-2 text-sm font-bold">{institute.name}</div>
    <div className="mx-auto mb-3 flex size-20 items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-muted">
      {t('students.photo', lang)}
    </div>
    <div className="text-base font-extrabold">{student.full_name}</div>
    <div className="mb-3 text-xs text-muted">
      {studentClassLabel(className, section) ?? dash}
    </div>
    <dl className="grid grid-cols-2 gap-y-1 text-left text-xs">
      <dt className="text-muted">{t('students.roll', lang)}</dt>
      <dd>{v(roll)}</dd>
      <dt className="text-muted">{t('students.bloodGroup', lang)}</dt>
      <dd>{v(student.blood_group)}</dd>
      <dt className="text-muted">{t('students.guardianMobile', lang)}</dt>
      <dd>{v(student.guardian_mobile)}</dd>
    </dl>
    {/* QR sits at the bottom of the card, centred under the mobile number
        (#143). Scanning it opens the public verification page (#144). */}
    <div
      className="mx-auto mt-3 flex size-24 items-center justify-center"
      aria-label={t('print.qr', lang)}
      // qrSvg is the `qrcode` package's output — SVG <path> geometry, not
      // the payload string echoed back — so injecting it is safe even
      // though the encoded URL includes the request host.
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  </div>
  )
}
