import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { ROUTINE_DAYS, ROUTINE_PERIODS, dayLabel, indexSlots, type RoutineSlot } from '@/lib/routine'
import { PrintPage, InstituteHeader, QrFooterRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { PrintPreflight } from '@/components/print/preflight'

// Printable weekly routine (ADR 0007: browser-native print, composed from the
// shared pieces). Landscape-ish grid fits portrait A4 at this density.

export default async function RoutinePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { class: classId } = await searchParams

  // #532: this used to notFound() here, and a UAT pass read that as the route
  // being broken — a routine exists as a feature, so `/routine/print` returning
  // "page not found" says the wrong thing. What is missing is a choice, not a
  // page, so offer the choice.
  if (!classId) {
    const { data: classes } = await supabase
      .from('classes')
      .select('id, name, section, group_department')
      .order('created_at')
    return (
      <PrintPreflight
        title={t('print.pickClassTitle', lang)}
        explanation={t('print.pickClassHelp', lang)}
        backHref="/school/classes/routine"
        backLabel={t('common.back', lang)}
      >
        <ul className="mt-4 flex flex-wrap gap-2">
          {(classes ?? []).map((c) => (
            <li key={c.id}>
              <Link
                href={`/school/classes/routine/print?class=${c.id}`}
                className="inline-flex rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
              >
                {classCatalogueLabel(c)}
              </Link>
            </li>
          ))}
        </ul>
      </PrintPreflight>
    )
  }

  const [institute, { data: cls }, { data: slots }, { data: subjects }, { data: teachers }, { data: rooms }] =
    await Promise.all([
      loadInstitutePrintHeader(supabase, lang),
      supabase.from('classes').select('name, section, group_department').eq('id', classId).maybeSingle(),
      supabase
        .from('routine_slots')
        .select('day_of_week, period, subject_id, teacher_id, room_id')
        .eq('class_id', classId),
      supabase.from('subjects').select('id, name'),
      supabase.from('employee_card').select('id, full_name'),
      supabase.from('rooms').select('id, name'),
    ])
  if (!institute || !cls) notFound()

  const byCell = indexSlots((slots ?? []) as RoutineSlot[])
  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const teacherName = new Map((teachers ?? []).map((e) => [e.id, e.full_name]))
  const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]))
  const classLabel = classCatalogueLabel(cls)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/school/classes/routine?class=${classId}`} aria-label={t('routine.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage orientation="landscape">
        <InstituteHeader institute={institute ?? undefined} docTitle={`${t('routine.docWord', lang)} — ${classLabel}`} />

        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-14 border border-line-strong bg-paper-muted p-1.5 font-semibold">
                {t('routine.period', lang)}
              </th>
              {ROUTINE_DAYS.map((d) => (
                <th key={d} className="border border-line-strong bg-paper-muted p-1.5 font-semibold">
                  {dayLabel(d, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUTINE_PERIODS.map((p) => (
              <tr key={p}>
                <td className="border border-line p-1.5 text-center font-semibold">{p}</td>
                {ROUTINE_DAYS.map((d) => {
                  const slot = byCell.get(`${d}:${p}`)
                  const teacher = slot?.teacher_id ? teacherName.get(slot.teacher_id) : null
                  const room = slot?.room_id ? roomName.get(slot.room_id) : null
                  return (
                    <td key={d} className="border border-line p-1.5 align-top">
                      {slot ? (
                        <>
                          <div className="font-semibold">
                            {(slot.subject_id && subjectName.get(slot.subject_id)) || '—'}
                          </div>
                          {(teacher || room) && (
                            <div className="text-muted">{[teacher, room].filter(Boolean).join(' · ')}</div>
                          )}
                        </>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
      </PrintPage>
    </main>
  )
}
