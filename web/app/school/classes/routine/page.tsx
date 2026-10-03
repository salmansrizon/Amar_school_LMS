import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { excludeArchivedOfferings } from '@/lib/school/archived-offerings-filter'
import { ROUTINE_DAYS, ROUTINE_PERIODS, dayLabel, indexSlots, type RoutineSlot } from '@/lib/routine'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { SlotCell, PublishButton, ClassPicker, type Option } from './routine-cell'
import { pageTitle } from '@/lib/page-title'

// Layout per ui/school-owner/class-routine-builder.html: toolbar (class picker
// left; Cancel + Publish right) over a period×day grid. Conflicts are rejected
// by the DB at save time, so instead of the mockup's post-hoc conflict badges
// the cell shows the rejection in red immediately.

export const generateMetadata = pageTitle('routine.title')

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  const { class: selectedClass = '' } = await searchParams
  // Routine builder's Class picker never offers an archived Offering (ADR
  // 0024) — building/extending a routine is new-selection use; the Routine
  // Print page keeps reading an already-built routine regardless of archive
  // status, unaffected by this.
  const { data: classes } = await applyGlobalYearFilterToOfferings(
    applyGlobalShiftFilterToOfferings(
      excludeArchivedOfferings(
        supabase
          .from('class_offerings')
          .select('id, name, section, group_department, shift, academic_year')
          .order('created_at'),
      ),
      shiftSelection,
    ),
    academicYearSelection,
  )

  return (
    <>
      <PageHeader
        title={t('routine.title', lang)}
        backHref="/school/classes"
        backLabel={t('classes.title', lang)}
        crumbs={schoolCrumbs(
          '/school/classes',
          lang,
          { label: t('classes.title', lang), href: '/school/classes' },
          { label: t('routine.title', lang) },
        )}
        actions={
          selectedClass && classes?.length ? (
            <>
              {/* ponytail: not PrintTrigger — its frame-ready check wants
                  '/print/' in the path, and this route ends in '/print'. */}
              <a
                href={`/school/classes/routine/print?class=${selectedClass}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('routine.print', lang)}
              </a>
              <Link
                href="/school/classes"
                className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('routine.cancel', lang)}
              </Link>
              <PublishGate classId={selectedClass} lang={lang} />
            </>
          ) : undefined
        }
      />

      {!classes?.length ? (
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">
          {t('routine.noClasses', lang)}
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <ClassPicker classes={classes} selected={selectedClass} lang={lang} showYear={showYear} />
          </div>

          {selectedClass ? (
            <RoutineGrid classId={selectedClass} lang={lang} />
          ) : (
            <p className="text-sm text-muted">{t('routine.pickClass', lang)}</p>
          )}
        </>
      )}
    </>
  )
}

async function PublishGate({ classId, lang }: { classId: string; lang: Lang }) {
  const { supabase } = await getSchoolContext()
  const { data: meta } = await supabase
    .from('class_routines')
    .select('published_at')
    .eq('class_id', classId)
    .maybeSingle()
  return <PublishButton classId={classId} publishedAt={meta?.published_at ?? null} lang={lang} />
}

async function RoutineGrid({ classId, lang }: { classId: string; lang: Lang }) {
  const { supabase } = await getSchoolContext()
  const [{ data: slots }, { data: subjects }, { data: teachers }, { data: rooms }] =
    await Promise.all([
      supabase
        .from('routine_slots')
        .select('day_of_week, period, subject_id, teacher_id, room_id')
        .eq('class_offering_id', classId),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('employee_card').select('id, full_name').order('full_name'),
      supabase.from('rooms').select('id, name').eq('is_active', true).order('name'),
    ])

  const byCell = indexSlots((slots ?? []) as RoutineSlot[])
  const subjectOpts: Option[] = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }))
  const teacherOpts: Option[] = (teachers ?? []).map((e) => ({ id: e.id, label: e.full_name }))
  const roomOpts: Option[] = (rooms ?? []).map((r) => ({ id: r.id, label: r.name }))

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 table-fixed border-collapse text-xs">
          <thead className="bg-paper-muted">
            <tr>
              <th className="w-16 px-4 py-3 text-sm font-semibold text-muted">
                {t('routine.period', lang)}
              </th>
              {ROUTINE_DAYS.map((d) => (
                <th key={d} className="border-l border-line px-4 py-3 text-left text-sm font-semibold text-muted">
                  {dayLabel(d, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROUTINE_PERIODS.map((p) => (
              <tr key={p}>
                <td className="bg-paper-muted px-4 py-3 text-center text-sm font-semibold">
                  {p}
                </td>
                {ROUTINE_DAYS.map((d) => (
                  <td key={d} className="border-l border-line align-top">
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
      <p className="border-t border-line px-4 py-3 text-xs text-muted">{t('routine.conflictNote', lang)}</p>
    </section>
  )
}
