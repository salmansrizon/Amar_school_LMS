import { GraduationCap, Hash, Phone, User, Wallet, CalendarOff } from 'lucide-react'
import { getSchoolContext } from '@/lib/school/context'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { feeStanding, type FeeStanding } from '@/lib/fees'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import type { RosterStudent } from '@/lib/school/roster'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, DrawerSection, DrawerItemCard, type DrawerFact } from '@/components/data-table/drawer-parts'
import { LeaveStatusPill } from '@/app/school/attendance/leave/leave-shared'
import { StudentProfile } from './[id]/student-profile'

// Student record drawer body (drawer redesign): facts + Fee Standing history +
// recent Leaves + the existing full profile (photo/edit form/archive — all
// unchanged, StudentProfile is untouched) tucked behind a collapsed section so
// every existing action stays one click away. Lives outside [id]/** — the
// profile agent owns that directory — and outside students/page.tsx, which
// only wires this in at the call site.
//
// Attendance Rate (map's third suggested section) is deliberately omitted:
// it depends on migration 0208's student_attendance_summary() RPC, which is
// not applied on the shared DB yet — showing it would mean guessing at a
// number the database cannot yet produce (the honesty rule this drawer runs
// on). Add it back once 0208 ships (lib/school/attendance-rate-source.ts
// already returns null gracefully until then).

type FeeHistoryRow = { month: number; year: number; standing: FeeStanding; due: number }
type LeaveRow = { id: string; from_day: string; to_day: string; status: string; reason: string | null }

export type StudentDrawerData = {
  recentFees: FeeHistoryRow[]
  recentLeaves: LeaveRow[]
}

const FEE_TONE = { paid: 'mint', partial: 'sun', due: 'alert' } as const
const FEE_LABEL = { paid: 'students.feePaid', partial: 'students.feePartial', due: 'students.feeDue' } as const

/** Related data for one Student's drawer — fetched only for the open `view`
 *  id, never for the whole roster: the last 4 months of Fee Collection
 *  Records and the last 3 Leave requests. */
export async function loadStudentDrawerData(studentId: string): Promise<StudentDrawerData> {
  const { supabase } = await getSchoolContext()
  const [{ data: feeRows }, { data: leaveRows }] = await Promise.all([
    supabase
      .from('fee_collection_records')
      .select('month, year, pay_amount, due_amount')
      .eq('student_id', studentId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(4),
    supabase
      .from('student_leaves')
      .select('id, from_day, to_day, status, reason')
      .eq('student_id', studentId)
      .order('from_day', { ascending: false })
      .limit(3),
  ])
  const recentFees: FeeHistoryRow[] = (feeRows ?? []).map((r) => ({
    month: r.month,
    year: r.year,
    due: Number(r.due_amount),
    standing: feeStanding({ pay_amount: Number(r.pay_amount), due_amount: Number(r.due_amount) }) ?? 'due',
  }))
  return { recentFees, recentLeaves: (leaveRows ?? []) as LeaveRow[] }
}

export function StudentDrawerBody({
  student,
  currentFee,
  data,
  showYear,
  lang,
}: {
  student: RosterStudent
  currentFee?: { standing: FeeStanding; due: number }
  data: StudentDrawerData
  showYear: boolean
  lang: Lang
}) {
  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const classLabel = student.class_name
    ? classCatalogueLabel(
        {
          name: student.class_name,
          section: student.section,
          group_department: student.group_department,
          shift: student.shift,
          academic_year: student.academic_year,
        },
        showYear,
      )
    : null

  const facts: DrawerFact[] = [
    { icon: <GraduationCap className="size-3.5" aria-hidden />, label: t('students.classSection', lang), value: classLabel ?? '—' },
    { icon: <Hash className="size-3.5" aria-hidden />, label: t('students.roll', lang), value: student.roll_number ?? '—' },
    { icon: <User className="size-3.5" aria-hidden />, label: t('students.guardianName', lang), value: student.guardian_name ?? '—' },
    { icon: <Phone className="size-3.5" aria-hidden />, label: t('students.guardianMobile', lang), value: student.guardian_mobile ?? '—' },
  ]

  return (
    <div className="space-y-1">
      <DrawerFacts facts={facts} />

      <DrawerSection title={t('students.feeHistorySectionTitle', lang)} count={data.recentFees.length}>
        {currentFee && (
          <div className="mb-3 flex items-center gap-2">
            <Pill tone={FEE_TONE[currentFee.standing]} pulse={currentFee.standing === 'due'}>
              {t(FEE_LABEL[currentFee.standing], lang)}
            </Pill>
            {currentFee.standing !== 'paid' && <span className="text-sm font-semibold">{tk(currentFee.due)}</span>}
            <span className="text-xs text-muted">{t('students.feeStanding', lang)}</span>
          </div>
        )}
        {data.recentFees.length > 0 ? (
          <div className="space-y-2">
            {data.recentFees.map((f) => (
              <DrawerItemCard
                key={`${f.year}-${f.month}`}
                icon={<Wallet className="size-4" aria-hidden />}
                title={`${fmt.format(f.month)}/${f.year}`}
                meta={f.standing !== 'paid' ? [tk(f.due)] : []}
                status={<Pill tone={FEE_TONE[f.standing]}>{t(FEE_LABEL[f.standing], lang)}</Pill>}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('students.noFeeHistory', lang)}</p>
        )}
      </DrawerSection>

      <DrawerSection title={t('students.leaveSectionTitle', lang)} count={data.recentLeaves.length} defaultOpen={data.recentLeaves.length > 0}>
        {data.recentLeaves.length > 0 ? (
          <div className="space-y-2">
            {data.recentLeaves.map((l) => (
              <DrawerItemCard
                key={l.id}
                icon={<CalendarOff className="size-4" aria-hidden />}
                title={`${l.from_day} – ${l.to_day}`}
                meta={l.reason ? [l.reason] : []}
                status={<LeaveStatusPill status={l.status} lang={lang} />}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('students.noLeaves', lang)}</p>
        )}
      </DrawerSection>

      <DrawerSection title={t('students.fullProfileSectionTitle', lang)} defaultOpen={false}>
        <StudentProfile id={student.id} lang={lang} />
      </DrawerSection>
    </div>
  )
}

/** Cancel target: the current query with `view` stripped — same close the ✕
 *  already performs, computed here so the sticky footer needs no client
 *  state. */
export function studentDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
