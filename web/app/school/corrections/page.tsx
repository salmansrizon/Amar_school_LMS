import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { sortRequests, isPhotoRequest, type CorrectionRequest } from '@/lib/student/corrections'
import { Card, PageHeader } from '@/components/ui/page'
import { ResolveButtons } from './resolve-buttons'

// The Owner's correction queue (#456).
//
// Applying goes through apply_profile_change_request, never a raw update: the
// write to `students` and the resolution of the request must not be able to come
// apart, and the whitelist is re-checked where the pen actually is.

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

export default async function CorrectionsQueuePage() {
  const lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const { data } = await supabase
    .from('student_profile_change_requests')
    .select('id, student_id, field, current_value, requested_value, note, status, reject_reason, created_at, resolved_at, students(full_name, roll_number)')
    .order('created_at', { ascending: false })
    .limit(300)

  const requests = sortRequests((data ?? []) as unknown as CorrectionRequest[])
  const byId = new Map((data ?? []).map((r) => [r.id, r]))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <>
      <PageHeader title={t('corrections.title', lang)} />

      {!requests.length ? (
        <Card>
          <p className="text-sm text-muted">{t('corrections.none', lang)}</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {requests.map((r) => {
              const row = byId.get(r.id) as { students?: { full_name: string; roll_number: number | null } | { full_name: string; roll_number: number | null }[] } | undefined
              const student = Array.isArray(row?.students) ? row?.students[0] : row?.students
              return (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {student?.full_name ?? '—'}
                      {student?.roll_number !== null && student?.roll_number !== undefined && (
                        <span className="ml-2 text-xs font-normal text-muted">#{student.roll_number}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      {new Date(r.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>

                  <p className="mt-1 text-sm">
                    <span className="font-medium">
                      {t(FIELD_LABELS[r.field] ?? 'students.name', lang)}
                    </span>
                    {isPhotoRequest(r) ? (
                      <span className="ml-2 text-muted">{t('student.newPhoto', lang)}</span>
                    ) : (
                      <>
                        <span className="ml-2 text-muted">
                          {t('corrections.was', lang)}: {r.current_value || '—'}
                        </span>
                        <span className="ml-2">
                          {t('corrections.becomes', lang)}: <strong>{r.requested_value}</strong>
                        </span>
                      </>
                    )}
                  </p>
                  {r.note && <p className="text-xs italic text-muted">{r.note}</p>}

                  {r.status === 'pending' ? (
                    role === 'school_owner' ? (
                      <div className="mt-2">
                        <ResolveButtons lang={lang} requestId={r.id} />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted">{t('student.reqPending', lang)}</p>
                    )
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      {t(r.status === 'applied' ? 'student.reqApplied' : 'student.reqRejected', lang)}
                      {r.reject_reason && ` — ${r.reject_reason}`}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
