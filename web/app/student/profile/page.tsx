import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { Droplet, GraduationCap, Hash, IdCard, Landmark, Link2, MapPin, Phone, User, Users } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui/page'
import { ProfileAside, ProfileField, ProfileSection } from '@/components/ui/profile'
import { storedFieldLabel } from '@/lib/students/stored-labels'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { sortRequests, isPhotoRequest, type CorrectionRequest } from '@/lib/student/corrections'
import { classSectionLabel } from '@/lib/students'
import { CorrectionForm } from './correction-form'
import { pageTitle } from '@/lib/page-title'

// The Student's own profile (#456): strictly read-only, with a way to ask.
//
// Read-only is enforced in RLS — a Student has no policy on `students` at all,
// and reads through the student_self view — not by which inputs this page
// renders. A disabled field is not a permission.

const FIELD_LABELS: Record<string, MessageKey> = {
  student_mobile: 'students.studentMobile',
  blood_group: 'students.bloodGroup',
  religion: 'students.religion',
  address: 'students.address',
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

export const generateMetadata = pageTitle('student.profileTitle')

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

  const field = (f: string) => storedFieldLabel(f, record[f], lang) || null
  const classSection = classSectionLabel(ctx.student.class_name, ctx.student.section)
  // Roll is a number (Bangla digits in Bangla, as on the home); the student
  // number is an identifier and stays as issued.
  const roll = ctx.student.roll_number !== null ? formatNumber(ctx.student.roll_number, lang) : null

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        icon="profile"
        title={t('student.profileTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.profileTitle', lang) }] }}
        subtitle={t('student.profileReadOnly', lang)}
      />

      <div className="@container mb-section">
        <div className="grid gap-4 @lg:grid-cols-[13rem_1fr]">
          <ProfileAside
            photo={
              // Their own face, which the profile never showed — while offering a
              // correction request for it. /api/student/photo is the Student-guarded
              // route the admit card already uses; it 404s when no photo is on file,
              // so a missing one degrades to the placeholder.
              record.photo_path ? (
                // eslint-disable-next-line @next/next/no-img-element -- private object behind a signed-URL redirect, not an optimizable asset
                <img
                  src="/api/student/photo"
                  alt={t('student.myPhoto', lang)}
                  className="mx-auto size-32 rounded-lg border border-line object-cover"
                />
              ) : (
                <span className="mx-auto flex size-32 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-muted">
                  {t('student.myPhoto', lang)}
                </span>
              )
            }
            facts={
              <>
                <ProfileField icon={User} label={t('students.name', lang)} value={ctx.student.full_name} />
                <ProfileField icon={GraduationCap} label={t('students.classSection', lang)} value={classSection || null} />
                <ProfileField icon={Hash} label={t('students.roll', lang)} value={roll} />
              </>
            }
            highlight={<ProfileField icon={IdCard} label={t('students.studentNo', lang)} value={ctx.student.student_no} />}
          />

          <div>
            <ProfileSection icon={User} title={t('students.identity', lang)} cols={2}>
              <ProfileField icon={Phone} label={t('students.studentMobile', lang)} value={field('student_mobile')} />
              <ProfileField icon={Droplet} label={t('students.bloodGroup', lang)} value={field('blood_group')} />
              <ProfileField icon={Landmark} label={t('students.religion', lang)} value={field('religion')} />
              <ProfileField icon={MapPin} label={t('students.address', lang)} value={field('address')} />
            </ProfileSection>
            <ProfileSection icon={Users} title={t('students.guardianInfo', lang)} cols={2}>
              <ProfileField icon={Users} label={t('students.guardianName', lang)} value={field('guardian_name')} />
              <ProfileField icon={Link2} label={t('students.relation', lang)} value={field('guardian_relation')} />
              <ProfileField icon={Phone} label={t('students.guardianMobile', lang)} value={field('guardian_mobile')} />
            </ProfileSection>
          </div>
        </div>
      </div>

      <div className="grid gap-grid lg:grid-cols-2">
      {!isReadOnly(ctx) && (
        <Card>
          <h2 className="mb-3 font-bold">{t('student.requestCorrection', lang)}</h2>
          <CorrectionForm lang={lang} current={record} labels={labels} />
        </Card>
      )}

      <Card padded={false} className="self-start">
      <h2 className="p-card pb-2 font-bold">{t('student.myRequests', lang)}</h2>
      {!requests?.length ? (
        <p className="p-card pt-0 text-sm text-muted">
          {t('student.noRequests', lang)}
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
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
                  {formatDate(r.created_at, lang)}
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
      </Card>
      </div>
    </main>
  )
}
