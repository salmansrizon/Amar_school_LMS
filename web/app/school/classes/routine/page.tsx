import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { ROUTINE_DAYS, ROUTINE_PERIODS, dayLabel, indexSlots, type RoutineSlot } from '@/lib/routine'
import { SlotCell, PublishButton, ClassPicker, type Option } from './routine-cell'

// Layout per ui/school-owner/class-routine-builder.html: toolbar (class picker
// left; Cancel + Publish right) over a period×day grid. Conflicts are rejected
// by the DB at save time, so instead of the mockup's post-hoc conflict badges
// the cell shows the rejection in red immediately.

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { class: selectedClass = '' } = await searchParams
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, section')
    .order('created_at')

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('routine.title', lang)}</h1>
        <Link href="/school/classes" className="text-sm text-brand-600 hover:underline">
          ← {t('classes.title', lang)}
        </Link>
      </div>

      {!classes?.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('routine.noClasses', lang)}
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <ClassPicker classes={classes} selected={selectedClass} lang={lang} />
            {selectedClass && (
              <span className="flex items-center gap-2">
                <a
                  href={`/school/classes/routine/print?class=${selectedClass}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
                >
                  {t('routine.print', lang)}
                </a>
                <Link
                  href="/school/classes"
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
                >
                  {t('routine.cancel', lang)}
                </Link>
                <PublishGate classId={selectedClass} lang={lang} />
              </span>
            )}
          </div>

          {selectedClass ? (
            <RoutineGrid classId={selectedClass} lang={lang} />
          ) : (
            <p className="text-sm text-muted">{t('routine.pickClass', lang)}</p>
          )}
        </>
      )}
    </main>
  )
}

async function PublishGate({ classId, lang }: { classId: string; lang: Lang }) {
  const supabase = await createClient()
  const { data: meta } = await supabase
    .from('class_routines')
    .select('published_at')
    .eq('class_id', classId)
    .maybeSingle()
  return <PublishButton classId={classId} publishedAt={meta?.published_at ?? null} lang={lang} />
}

async function RoutineGrid({ classId, lang }: { classId: string; lang: Lang }) {
  const supabase = await createClient()
  const [{ data: slots }, { data: subjects }, { data: teachers }, { data: rooms }] =
    await Promise.all([
      supabase
        .from('routine_slots')
        .select('day_of_week, period, subject_id, teacher_id, room_id')
        .eq('class_id', classId),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('employees').select('id, full_name').order('full_name'),
      supabase.from('rooms').select('id, name').eq('is_active', true).order('name'),
    ])

  const byCell = indexSlots((slots ?? []) as RoutineSlot[])
  const subjectOpts: Option[] = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }))
  const teacherOpts: Option[] = (teachers ?? []).map((e) => ({ id: e.id, label: e.full_name }))
  const roomOpts: Option[] = (rooms ?? []).map((r) => ({ id: r.id, label: r.name }))

  return (
    <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-16 border border-line bg-paper-muted p-1.5 font-semibold">
                {t('routine.period', lang)}
              </th>
              {ROUTINE_DAYS.map((d) => (
                <th key={d} className="border border-line bg-paper-muted p-1.5 font-semibold">
                  {dayLabel(d, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUTINE_PERIODS.map((p) => (
              <tr key={p}>
                <td className="border border-line bg-paper-muted p-1.5 text-center font-semibold">
                  {p}
                </td>
                {ROUTINE_DAYS.map((d) => (
                  <td key={d} className="border border-line align-top">
                    <SlotCell
                      classId={classId}
                      day={d}
                      period={p}
                      slot={byCell.get(`${d}:${p}`) ?? null}
                      subjects={subjectOpts}
                      teachers={teacherOpts}
                      rooms={roomOpts}
                      lang={lang}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">{t('routine.conflictNote', lang)}</p>
    </section>
  )
}
