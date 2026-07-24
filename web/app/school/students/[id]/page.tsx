import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { averageRating, isEntryLocked } from '@/lib/behaviour'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { classSectionLabel } from '@/lib/students'
import { AddEntryForm, EditableEntry } from './behaviour-controls'
import { ArchiveToggle, PhotoControl, ProfileEditor } from './profile-controls'
import { StudentSubjects, type AssignedSubject } from './subject-controls'
import { PrintLink } from '@/components/print/print-link'

// Layout per ui/school-owner/student-detail.html: status + roll header with
// Transfer/Print actions, photo card beside carded profile sections (Identity /
// Address / Guardian / Benefits / Previous Institute / Siblings), subject
// assignment (issue #46), and the behaviour log (issue #22) at the bottom.
// Edit reuses the admission sections.

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-sm">{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
      <h3 className="mb-3 font-bold">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

export default async function StudentDetailPage({
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

  const { data: student } = await supabase.from('students').select('*').eq('id', id).single()
  if (!student) notFound()

  const [{ data: entries }, { data: classes }, { data: subjects }, { data: assignments }] =
    await Promise.all([
      supabase
        .from('behaviour_log_entries')
        .select('id, note, rating, remind_date, created_at')
        .eq('student_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('classes').select('name, section').order('created_at'),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('student_subjects').select('subject_id, is_optional').eq('student_id', id),
    ])

  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const assignedSubjects: AssignedSubject[] = (assignments ?? []).map((a) => ({
    subject_id: a.subject_id,
    name: subjectName.get(a.subject_id) ?? a.subject_id,
    is_optional: a.is_optional,
  }))

  const now = new Date()
  const avg = averageRating((entries ?? []).map((e) => e.rating))
  const archived = student.archived_at !== null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const flag = (on: boolean, onKey: MessageKey, offKey: MessageKey) => (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        on ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
      }`}
    >
      {t(on ? onKey : offKey, lang)}
    </span>
  )

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{student.full_name}</h1>
        <Link href="/school/students" aria-label={t('students.listTitle', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              archived ? 'bg-paper-muted text-muted' : 'bg-mint-soft text-mint-deep'
            }`}
          >
            {t(archived ? 'students.oldStudent' : 'students.active', lang)}
          </span>
          <span>
            {[
              student.roll_number !== null ? `${t('students.roll', lang)} ${student.roll_number}` : null,
              classSectionLabel(student.class_name, student.section),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintLink
            href={`/school/students/${id}/print/admission`}
            label={t('students.printAdmission', lang)}
            className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
          />
          <PrintLink
            href={`/school/students/${id}/print/id-card`}
            label={t('students.printIdCard', lang)}
            className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
          />
          <Link
            href={`/school/students/${id}/transfer`}
            className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.transfer', lang)}
          </Link>
          <ArchiveToggle lang={lang} studentId={id} archived={archived} />
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card self-start">
          <PhotoControl lang={lang} studentId={id} hasPhoto={student.photo_path !== null} />
        </div>

        <ProfileEditor lang={lang} student={student} classes={classes ?? []}>
          <InfoCard title={t('students.identity', lang)}>
            <InfoRow label={t('students.name', lang)} value={student.full_name} />
            <InfoRow
              label={t('students.dob', lang)}
              value={
                student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString(locale) : null
              }
            />
            <InfoRow
              label={t('students.gender', lang)}
              value={
                student.gender === 'male'
                  ? t('students.male', lang)
                  : student.gender === 'female'
                    ? t('students.female', lang)
                    : student.gender
              }
            />
            <InfoRow label={t('students.bloodGroup', lang)} value={student.blood_group} />
            <InfoRow
              label={t('students.classSection', lang)}
              value={classSectionLabel(student.class_name, student.section)}
            />
            <InfoRow label={t('students.roll', lang)} value={student.roll_number} />
            <InfoRow label={t('students.religion', lang)} value={student.religion} />
            <InfoRow label={t('students.studentMobile', lang)} value={student.student_mobile} />
          </InfoCard>

          <InfoCard title={t('students.address', lang)}>
            <InfoRow label={t('students.village', lang)} value={student.village} />
            <InfoRow label={t('students.union', lang)} value={student.union_name} />
            <InfoRow label={t('students.upazila', lang)} value={student.upazila} />
            <InfoRow label={t('students.district', lang)} value={student.district} />
          </InfoCard>

          <InfoCard title={t('students.guardianInfo', lang)}>
            <InfoRow label={t('students.guardianName', lang)} value={student.guardian_name} />
            <InfoRow
              label={t('students.relation', lang)}
              value={
                student.guardian_relation === 'father'
                  ? t('students.father', lang)
                  : student.guardian_relation === 'mother'
                    ? t('students.mother', lang)
                    : student.guardian_relation
              }
            />
            <InfoRow label={t('students.guardianMobile', lang)} value={student.guardian_mobile} />
            <InfoRow label={t('students.guardianNid', lang)} value={student.guardian_nid} />
          </InfoCard>

          <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
            <h3 className="mb-3 font-bold">{t('students.benefitFlags', lang)}</h3>
            <div className="flex flex-wrap gap-2">
              {flag(
                student.is_freedom_fighter_child,
                'students.freedomFighterChild',
                'students.notFreedomFighterChild',
              )}
              {flag(student.is_indigenous, 'students.indigenous', 'students.notIndigenous')}
            </div>
          </section>

          <InfoCard title={t('students.previousInstitute', lang)}>
            <InfoRow label={t('students.previousInstituteName', lang)} value={student.previous_institute} />
            <InfoRow label={t('students.previousClass', lang)} value={student.previous_class} />
          </InfoCard>

          <InfoCard title={t('students.siblingInfo', lang)}>
            <InfoRow label={t('students.siblingDetails', lang)} value={student.sibling_info} />
          </InfoCard>
        </ProfileEditor>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('subjects.title', lang)}</h2>
        <StudentSubjects
          studentId={student.id}
          assigned={assignedSubjects}
          available={subjects ?? []}
          lang={lang}
        />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('behaviour.title', lang)}</h2>
          {avg !== null && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
              {t('behaviour.avg', lang)}: {avg}
            </span>
          )}
        </div>
        <AddEntryForm studentId={student.id} lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="mb-3 text-xs text-muted">{t('behaviour.lockedHint', lang)}</p>
        {!entries?.length && <p className="text-sm text-muted">{t('behaviour.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {entries?.map((entry) => (
            <li key={entry.id} className="py-3">
              <EditableEntry
                entry={entry}
                studentId={student.id}
                locked={isEntryLocked(new Date(entry.created_at), now)}
                lang={lang}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
