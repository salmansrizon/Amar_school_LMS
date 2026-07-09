import type { NextRequest } from 'next/server'
import type { Lang } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'
import { createClient } from '@/lib/supabase/server'
import { ROUTINE_DAYS, ROUTINE_PERIODS, dayLabel } from '@/lib/routine'
import { RoutineDocument, type RoutineData, type RoutineCellText } from '@/lib/pdf/templates/routine'
import { renderPdf } from '@/lib/pdf/render'
import { t } from '@/lib/i18n'

// react-pdf needs Node APIs (ADR 0007).
export const runtime = 'nodejs'

/**
 * Printable weekly routine for one class (issue #45). Real School data, so it is
 * authenticated and RLS-scoped: every query runs as the caller, returning only
 * their School's rows. `?lang` overrides the cookie language.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const classId = url.searchParams.get('class')
  if (!classId) return new Response('class is required', { status: 400 })
  const override = url.searchParams.get('lang')
  const lang: Lang = override === 'en' ? 'en' : override === 'bn' ? 'bn' : await currentLang()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const [{ data: cls }, { data: slots }, { data: meta }, { data: subjects }, { data: teachers }, { data: rooms }, { data: profile }] =
    await Promise.all([
      supabase.from('classes').select('id, name, section, school_id').eq('id', classId).maybeSingle(),
      supabase.from('routine_slots').select('day_of_week, period, subject_id, teacher_id, room_id').eq('class_id', classId),
      supabase.from('class_routines').select('published_at').eq('class_id', classId).maybeSingle(),
      supabase.from('subjects').select('id, name'),
      supabase.from('employees').select('id, full_name'),
      supabase.from('rooms').select('id, name'),
      supabase.from('profiles').select('school_id').eq('id', user.id).single(),
    ])

  // maybeSingle returns null when RLS hides the row (wrong school / bad id).
  if (!cls) return new Response('not found', { status: 404 })

  const { data: school } = await supabase.from('schools').select('name').eq('id', profile?.school_id ?? cls.school_id).maybeSingle()

  const subjectName = new Map((subjects ?? []).map((r) => [r.id, r.name]))
  const teacherName = new Map((teachers ?? []).map((r) => [r.id, r.full_name]))
  const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]))

  const cells: Record<string, RoutineCellText> = {}
  for (const sl of slots ?? []) {
    cells[`${sl.day_of_week}:${sl.period}`] = {
      subject: sl.subject_id ? subjectName.get(sl.subject_id) : undefined,
      teacher: sl.teacher_id ? teacherName.get(sl.teacher_id) : undefined,
      room: sl.room_id ? roomName.get(sl.room_id) : undefined,
    }
  }

  const data: RoutineData = {
    institute: { name: school?.name ?? '—', address: '' },
    title: t('routine.title', lang),
    className: cls.name,
    section: cls.section ?? undefined,
    published: Boolean(meta?.published_at),
    days: ROUTINE_DAYS.map((d) => ({ index: d, label: dayLabel(d, lang) })),
    periods: [...ROUTINE_PERIODS],
    cells,
  }

  const pdf = await renderPdf(<RoutineDocument data={data} lang={lang} />)
  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="routine-${cls.name}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
