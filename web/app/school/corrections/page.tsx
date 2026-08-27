import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { sortRequests, isPhotoRequest, type CorrectionRequest } from '@/lib/student/corrections'
import { hubSummary } from '@/lib/student/hub-source'
import { waitingHours, waitingTone } from '@/lib/student/hub'
import { Card, PageHeader } from '@/components/ui/page'
import { HubTabs } from '../messages-hub-tabs'
import { ResolveButtons } from './resolve-buttons'

// The Corrections tab of বার্তা ও অনুরোধ (#456 queue, #509 section).
//
// Applying goes through apply_profile_change_request, never a raw update: the
// write to `students` and the resolution of the request must not be able to come
// apart, and the whitelist is re-checked where the pen actually is.
//
// Reading is now scoped by class attachment (0152) and applying is still
// owner-only — ADR 0018 widened who may look at the queue, not who may act on
// it. A Class Teacher seeing a pending request she cannot apply is the point:
// she is the one who knows whether the new phone number is right.

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

interface RequestStudent {
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
}

/** PostgREST returns an embedded one-to-one as an object, but types it as a
 *  union with an array. One place to unwrap it. */
function studentOf(row: { students?: RequestStudent | RequestStudent[] | null }): RequestStudent | undefined {
  return Array.isArray(row.students) ? row.students[0] : (row.students ?? undefined)
}

export default async function CorrectionsQueuePage() {
  const lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const { data } = await supabase
    .from('student_profile_change_requests')
    .select(
      'id, student_id, field, current_value, requested_value, note, status, reject_reason, created_at, resolved_at, students(full_name, roll_number, class_name, section)',
    )
    .order('created_at', { ascending: false })
    .limit(300)

  const rows = (data ?? []) as unknown as (CorrectionRequest & { students?: RequestStudent | RequestStudent[] })[]
  const requests = sortRequests(rows as CorrectionRequest[])
  const byId = new Map(rows.map((r) => [r.id, r]))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  const summary = await hubSummary(supabase, {
    skip: 'corrections',
    known: rows.filter((r) => r.status === 'pending').length,
  })

  return (
    <>
      <PageHeader title={t('hub.title', lang)} />
      <HubTabs active="/school/corrections" lang={lang} summary={summary} />

      {!requests.length ? (
        <Card>
          <p className="text-sm text-muted">
            {summary.reachesAnyClass ? t('corrections.none', lang) : t('hub.noClasses', lang)}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => {
            const student = studentOf(byId.get(r.id) ?? {})
            // A resolved request is settled whichever way it went; `resolved_at`
            // is what waitingTone reads, so rejected reads as mint too.
            const tone = waitingTone({ created_at: r.created_at, replied_at: r.resolved_at, status: r.status })
            const hours = waitingHours({ created_at: r.created_at, replied_at: r.resolved_at })
            return (
              <li key={r.id}>
                <Card tone={tone} className="p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {t(FIELD_LABELS[r.field] ?? 'students.name', lang)}
                    </span>
                    <span className="text-xs text-muted">
                      {r.status === 'pending'
                        ? hours < 1
                          ? t('hub.freshlyAsked', lang)
                          : `${hours}${t('hub.waitingHours', lang)}`
                        : new Date(r.created_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                          })}
                    </span>
                  </div>

                  {/* Card anatomy, both queues: waiting-age, student name,
                      class/section. */}
                  <p className="mt-0.5 text-xs text-muted">
                    {student?.full_name ?? '—'}
                    {student?.class_name &&
                      ` · ${student.class_name}${student.section ? ` ${student.section}` : ''}`}
                    {student?.roll_number !== null && student?.roll_number !== undefined && ` · #${student.roll_number}`}
                  </p>

                  <p className="mt-2 text-sm">
                    {isPhotoRequest(r) ? (
                      <span className="text-muted">{t('student.newPhoto', lang)}</span>
                    ) : (
                      <>
                        <span className="text-muted">
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
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
