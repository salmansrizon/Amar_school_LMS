import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { averageRating, isEntryLocked } from '@/lib/behaviour'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { AddEntryForm, EditableEntry } from './behaviour-controls'
import { ArchiveToggle, PhotoUpload, TransferForm } from './student-detail-controls'

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: student }, { data: shifts }, { data: transfers }] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).single(),
    supabase.from('shifts').select('id, name').order('name'),
    supabase
      .from('student_transfers')
      .select('id, from_class, from_section, to_class, to_section, note, transferred_at')
      .eq('student_id', id)
      .order('transferred_at', { ascending: false }),
  ])
  if (!student) notFound()

  const shiftName = new Map((shifts ?? []).map((sh) => [sh.id, sh.name]))
  const archived = Boolean(student.archived_at)

  const { data: entries } = await supabase
    .from('behaviour_log_entries')
    .select('id, note, rating, remind_date, created_at')
    .eq('student_id', id)
    .order('created_at', { ascending: false })
  const now = new Date()
  const avg = averageRating((entries ?? []).map((e) => e.rating))

  const bool = (v: boolean) => (v ? '✓' : '—')

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          {student.full_name}
          {archived && (
            <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
              {t('students.archived', lang)}
            </span>
          )}
        </h1>
        <Link href="/school/students" className="text-sm text-brand-600 hover:underline">
          ← {t('students.title', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <PhotoUpload studentId={id} hasPhoto={Boolean(student.photo_path)} lang={lang} />
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/school/students/${id}/edit`}
              className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('students.edit', lang)}
            </Link>
            <ArchiveToggle studentId={id} archived={archived} lang={lang} />
          </div>
        </div>

        <ProfileGrid student={student} shiftName={shiftName} boolFmt={bool} lang={lang} />
      </section>

      {/* Class/shift transfer + history */}
      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('students.transfer', lang)}</h2>
        <TransferForm studentId={id} shifts={shifts ?? []} lang={lang} />
        <h3 className="mt-4 mb-2 text-sm font-semibold">{t('students.transferHistory', lang)}</h3>
        {!transfers?.length ? (
          <p className="text-sm text-muted">{t('students.noTransfers', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {transfers.map((tr) => (
              <li key={tr.id} className="py-2">
                <span className="text-muted">{new Date(tr.transferred_at).toLocaleDateString()}: </span>
                {[tr.from_class, tr.from_section].filter(Boolean).join(' ') || '—'} →{' '}
                {[tr.to_class, tr.to_section].filter(Boolean).join(' ') || '—'}
                {tr.note ? <span className="text-muted"> · {tr.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Behaviour (from MVP; deepening is #46) */}
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

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value != null && value !== '' ? value : '—'}</dd>
    </div>
  )
}

function ProfileGrid({
  student,
  shiftName,
  boolFmt,
  lang,
}: {
  student: Record<string, unknown>
  shiftName: Map<string, string>
  boolFmt: (v: boolean) => string
  lang: Lang
}) {
  const g = (k: string) => (student[k] as string | number | null) ?? null
  const shiftId = student.shift_id as string | null
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <Field label={t('students.roll', lang)} value={g('roll_number')} />
      <Field label={t('students.class', lang)} value={g('class_name')} />
      <Field label={t('students.section', lang)} value={g('section')} />
      <Field label={t('students.shift', lang)} value={shiftId ? shiftName.get(shiftId) : null} />
      <Field label={t('students.gender', lang)} value={g('gender')} />
      <Field label={t('students.dob', lang)} value={g('date_of_birth')} />
      <Field label={t('students.blood', lang)} value={g('blood_group')} />
      <Field label={t('students.religion', lang)} value={g('religion')} />
      <Field label={t('students.mobile', lang)} value={g('student_mobile')} />
      <Field label={t('students.village', lang)} value={g('village')} />
      <Field label={t('students.union', lang)} value={g('union_name')} />
      <Field label={t('students.upazila', lang)} value={g('upazila')} />
      <Field label={t('students.district', lang)} value={g('district')} />
      <Field label={t('students.guardianName', lang)} value={g('guardian_name')} />
      <Field label={t('students.guardianRelation', lang)} value={g('guardian_relation')} />
      <Field label={t('students.guardianMobile', lang)} value={g('guardian_mobile')} />
      <Field label={t('students.guardianNid', lang)} value={g('guardian_nid')} />
      <Field label={t('students.prevInstitute', lang)} value={g('previous_institute')} />
      <Field label={t('students.prevClass', lang)} value={g('previous_class')} />
      <Field label={t('students.siblings', lang)} value={g('sibling_info')} />
      <Field label={t('students.freedomFighter', lang)} value={boolFmt(Boolean(student.is_freedom_fighter_child))} />
      <Field label={t('students.indigenous', lang)} value={boolFmt(Boolean(student.is_indigenous))} />
    </dl>
  )
}
