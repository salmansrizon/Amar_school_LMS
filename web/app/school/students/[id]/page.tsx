import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRightLeft, FileText, IdCard } from 'lucide-react'
import { averageRating, isEntryLocked } from '@/lib/behaviour'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { classSectionLabel } from '@/lib/students'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Crumbs } from '@/components/ui/page'
import { ProfileHeader } from '@/components/ui/profile'
import { Pill } from '@/components/data-table/data-table'
import { AddEntryForm, EditableEntry } from './behaviour-controls'
import { ArchiveToggle } from './profile-controls'
import { StudentProfile, getStudent } from './student-profile'
import { StudentSubjects, type AssignedSubject } from './subject-controls'
import { StudentLoginPanel, type StudentLoginStatus } from './login-controls'
import { PrintTrigger } from '@/components/print/print-trigger'

// Layout per ui/school-owner/student-detail.html: status + roll header with
// Transfer/Print actions, photo card beside carded profile sections (Identity /
// Address / Guardian / Benefits / Previous Institute / Siblings), subject
// assignment (issue #46), and the behaviour log (issue #22) at the bottom.
// Edit reuses the admission sections.

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const student = await getStudent(id)
  if (!student) notFound()

  // Login status is owner-only (#442) — issuing and resetting a child's password
  // is not a Staff-User act, and the RPCs reject them regardless.
  const isOwner = role === 'school_owner'

  const [{ data: entries }, { data: subjects }, { data: assignments }, loginRes] =
    await Promise.all([
      supabase
        .from('behaviour_log_entries')
        .select('id, note, rating, remind_date, created_at')
        .eq('student_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('student_subjects').select('subject_id, is_optional').eq('student_id', id),
      isOwner
        ? supabase
            .from('student_login_info')
            .select('email, last_sign_in_at')
            .eq('student_id', id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
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
  const classSection = classSectionLabel(student.class_name, student.section)
  return (
    <div>
      <Crumbs {...schoolCrumbs(
          '/school/students',
          lang,
          { label: t('students.listTitle', lang), href: '/school/students' },
          { label: student.full_name },
        )} />

      <ProfileHeader
        name={student.full_name}
        status={
          <Pill tone={archived ? 'muted' : 'mint'} live={!archived}>
            {t(archived ? 'students.oldStudent' : 'students.active', lang)}
          </Pill>
        }
        meta={[
          classSection ? `${t('students.classSection', lang)}: ${classSection}` : null,
          student.roll_number !== null ? `${t('students.roll', lang)}: ${student.roll_number}` : null,
        ]
          .filter(Boolean)
          .join('   |   ')}
        actions={
          <>
            <PrintTrigger
              href={`/school/students/${id}/print/admission`}
              label={t('students.printAdmission', lang)}
              icon={<FileText className="size-4" aria-hidden />}
            />
            <PrintTrigger
              href={`/school/students/${id}/print/id-card`}
              label={t('students.printIdCard', lang)}
              icon={<IdCard className="size-4" aria-hidden />}
            />
            <Link
              href={`/school/students/${id}/transfer`}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted sm:min-h-9"
            >
              <ArrowRightLeft className="size-4" aria-hidden />
              {t('students.transfer', lang)}
            </Link>
            <ArchiveToggle lang={lang} studentId={id} archived={archived} />
          </>
        }
      />

      <StudentProfile id={id} lang={lang} />

      {isOwner && (
        <StudentLoginPanel
          lang={lang}
          studentId={id}
          status={(loginRes.data as StudentLoginStatus | null) ?? null}
          hasGuardianPhone={Boolean(student.guardian_phone)}
        />
      )}

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('subjects.title', lang)}</h2>
        <StudentSubjects
          studentId={student.id}
          assigned={assignedSubjects}
          available={subjects ?? []}
          lang={lang}
        />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
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

      <section className="rounded-lg border border-line bg-paper p-5">
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
    </div>
  )
}
