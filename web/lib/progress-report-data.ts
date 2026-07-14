// Exams IV/V (issues #33, #48, PRD §5.5): the DB-touching "extras" a progress
// report carries beyond exam-print-data.ts's marks/grade/rank — Behaviour
// Rating (behaviour_log_entries), Co-curricular Checklist (migration 0052)
// and the school-year-to-date Attendance %. Extracted out of the per-student
// page (issue #33) so batch print-all (issue #48) can reuse the exact same
// loader per filtered student instead of re-deriving it.
import type { createClient } from '@/lib/supabase/server'
import { ratingBand, type RatingBand } from '@/lib/behaviour'
import { attendancePercent } from '@/lib/attendance-manual'
import { sortCocurricularItems, buildChecklistRows } from '@/lib/cocurricular'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const BEHAVIOUR_ENTRY_LIMIT = 5

export interface ProgressReportBehaviourRow {
  id: string
  note: string
  band: RatingBand
}

export interface ProgressReportChecklistRow {
  id: string
  label: string
  checked: boolean
}

export interface ProgressReportExtras {
  attendancePercent: number | null
  behaviourRows: ProgressReportBehaviourRow[]
  checklistItems: ProgressReportChecklistRow[]
}

/** School-year-to-date window: Jan 1 of the exam's year through today,
 * clamped to Dec 31 for a past exam year. */
function attendanceRange(examYear: number): { rangeStart: string; rangeEnd: string } {
  const today = new Date().toISOString().slice(0, 10)
  const yearEnd = `${examYear}-12-31`
  return { rangeStart: `${examYear}-01-01`, rangeEnd: today < yearEnd ? today : yearEnd }
}

export async function loadProgressReportExtras(
  supabase: SupabaseServerClient,
  examId: string,
  studentId: string,
  examYear: number,
): Promise<ProgressReportExtras> {
  const { rangeStart, rangeEnd } = attendanceRange(examYear)

  const [{ data: behaviourEntries }, { data: items }, { data: markRows }, presentResult, absentResult] =
    await Promise.all([
      supabase
        .from('behaviour_log_entries')
        .select('id, note, rating')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(BEHAVIOUR_ENTRY_LIMIT),
      supabase.from('cocurricular_items').select('id, label, sort_order'),
      supabase.from('cocurricular_checklist_marks').select('item_id, checked').eq('exam_id', examId).eq('student_id', studentId),
      supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('person_type', 'student')
        .eq('person_id', studentId)
        .gte('att_date', rangeStart)
        .lte('att_date', rangeEnd),
      supabase.rpc('absent_working_days_in_range', { p_student: studentId, p_start: rangeStart, p_end: rangeEnd }),
    ])

  const checkedIds = new Set((markRows ?? []).filter((m) => m.checked).map((m) => m.item_id))
  const checklistItems = buildChecklistRows(sortCocurricularItems(items ?? []), checkedIds)

  return {
    attendancePercent: attendancePercent(presentResult.count ?? 0, absentResult.data ?? 0),
    behaviourRows: (behaviourEntries ?? []).map((e) => ({ id: e.id, note: e.note, band: ratingBand(e.rating) })),
    checklistItems,
  }
}
