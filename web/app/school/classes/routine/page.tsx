import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { ROUTINE_DAYS, ROUTINE_PERIODS, dayLabel, indexSlots, type RoutineSlot } from '@/lib/routine'
import { SlotCell, PublishButton, type Option } from './routine-cell'

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { class: selectedClass } = await searchParams
  const { data: classes } = await supabase.from('classes').select('id, name, section').order('created_at')

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('routine.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      {!classes?.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('routine.noClasses', lang)}
        </p>
      ) : (
        <>
          {/* Class picker */}
          <div className="mb-4 flex flex-wrap gap-2">
            {classes.map((c) => {
              const active = c.id === selectedClass
              return (
                <Link
                  key={c.id}
                  href={`/school/classes/routine?class=${c.id}`}
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    active ? 'bg-brand-500 text-white' : 'border border-line-strong hover:bg-paper-muted'
                  }`}
                >
                  {c.name}
                  {c.section ? ` · ${c.section}` : ''}
                </Link>
              )
            })}
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

async function RoutineGrid({ classId, lang }: { classId: string; lang: 'bn' | 'en' }) {
  const supabase = await createClient()
  const [{ data: slots }, { data: meta }, { data: subjects }, { data: teachers }, { data: rooms }] =
    await Promise.all([
      supabase
        .from('routine_slots')
        .select('day_of_week, period, subject_id, teacher_id, room_id')
        .eq('class_id', classId),
      supabase.from('class_routines').select('published_at').eq('class_id', classId).maybeSingle(),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('employees').select('id, full_name').order('full_name'),
      supabase.from('rooms').select('id, name').order('name'),
    ])

  const byCell = indexSlots((slots ?? []) as RoutineSlot[])
  const subjectOpts: Option[] = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }))
  const teacherOpts: Option[] = (teachers ?? []).map((e) => ({ id: e.id, label: e.full_name }))
  const roomOpts: Option[] = (rooms ?? []).map((r) => ({ id: r.id, label: r.name }))

  return (
    <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PublishButton classId={classId} publishedAt={meta?.published_at ?? null} lang={lang} />
        <a
          href={`/api/print/routine?class=${classId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          {t('routine.print', lang)} →
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
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
                <td className="border border-line bg-paper-muted p-1.5 text-center font-semibold">{p}</td>
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
    </section>
  )
}
