import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { sortRequests, isPhotoRequest, type CorrectionRequest } from '@/lib/student/corrections'
import { classSectionLabel } from '@/lib/students'
import { CorrectionForm } from './correction-form'

// The Student's own profile (#456): strictly read-only, with a way to ask.
//
// Read-only is enforced in RLS — a Student has no policy on `students` at all,
// and reads through the student_self view — not by which inputs this page
// renders. A disabled field is not a permission.

const FIELD_LABELS: Record<string, MessageKey> = {
  student_mobile: 'students.studentMobile',
  blood_group: 'students.bloodGroup',
  religion: 'students.religion',
  village: 'students.village',
  union_name: 'students.union',
  upazila: 'students.upazila',
  district: 'students.district',
  guardian_name: 'students.guardianName',
  guardian_relation: 'students.relation',
  guardian_mobile: 'students.guardianMobile',
  photo_path: 'students.photo',
}

const STATUS: Record<string, MessageKey> = {
  pending: 'student.reqPending',
  applied: 'student.reqApplied',
  rejected: 'student.reqRejected',
}

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-sun-soft text-sun-deep',
  applied: 'bg-mint-soft text-mint-deep',
  rejected: 'bg-alert-soft text-alert-deep',
}

export default async function StudentProfilePage() {
  const lang = await currentLang()
  const ctx = await getStudentContext()

  // The full safe column set, from the view that decides what "safe" means.
  const { data: self } = await ctx.supabase.from('student_self').select('*').single()
  const { data: requests } = await ctx.supabase
    .from('student_profile_change_requests')
    .select('id, field, current_value, requested_value, note, status, reject_reason, created_at, resolved_at')

  const record = (self ?? {}) as Record<string, string | null>
  const labels = Object.fromEntries(
    Object.entries(FIELD_LABELS).map(([field, key]) => [field, t(key, lang)]),
  )

  const rows: [string, string | null][] = [
    ['students.name', ctx.student.full_name],
    ['students.studentNo', ctx.student.student_no],
    ['students.classSection', classSectionLabel(ctx.student.class_name, ctx.student.section)],
    ['students.roll', ctx.student.roll_number !== null ? String(ctx.student.roll_number) : null],
    ...Object.entries(FIELD_LABELS)
      .filter(([field]) => field !== 'photo_path')
      .map(([field, key]) => [key, record[field] ?? null] as [string, string | null]),
  ]

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{t('student.profileTitle', lang)}</h1>
      <p className="mb-4 text-sm text-muted">{t('student.profileReadOnly', lang)}</p>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs font-semibold text-muted">{t(key as MessageKey, lang)}</dt>
              <dd className="text-sm">{value || <span className="text-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      {!isReadOnly(ctx) && (
        <section className="mb-6 rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 font-bold">{t('student.requestCorrection', lang)}</h2>
          <CorrectionForm lang={lang} current={record} labels={labels} />
        </section>
      )}

      <h2 className="mb-2 font-bold">{t('student.myRequests', lang)}</h2>
      {!requests?.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noRequests', lang)}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
          {sortRequests(requests as CorrectionRequest[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {labels[r.field] ?? r.field}
                  {!isPhotoRequest(r) && (
                    <span className="ml-2 font-normal text-muted">→ {r.requested_value}</span>
                  )}
                </span>
                <span className="block text-xs text-muted">
                  {new Date(r.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
                {r.reject_reason && (
                  <span className="mt-1 block text-xs text-alert-deep">{r.reject_reason}</span>
                )}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>
                {t(STATUS[r.status], lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
