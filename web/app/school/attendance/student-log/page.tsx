import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { filterRoster } from '@/lib/attendance-manual'
import { classSectionOptions, parseClassSectionKey } from '@/lib/class-section-options'
import { AttendanceTabs } from '../attendance-tabs'
import { selectClass } from '@/components/ui/field'

// Student Log finder (map #380, docs/011_student_module.md): Class -> Section
// picker + roll-sorted roster, each row opening that student's attendance
// history. Same class/section Form pattern as mark/page.tsx and
// book/page.tsx; filterRoster does the sort (roll number, unrolled students
// falling back to name) so this page adds no new ordering logic.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function StudentLogPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string }>
}) {
  const { classSection = '' } = await searchParams
  const { className, section } = parseClassSectionKey(classSection)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, class_name, section, roll_number')
    .order('full_name')
  const roster = students ?? []
  const combos = classSectionOptions(roster)

  // filterRoster owns the sort (roll number, then name for unrolled students);
  // it drops class_name/section from its return shape, so those are recovered
  // from the roster already in hand rather than re-querying.
  const byId = new Map(roster.map((s) => [s.id, s]))
  const visible = filterRoster(roster, className, section).map((s) => ({
    ...s,
    class_name: byId.get(s.id)?.class_name ?? null,
    section: byId.get(s.id)?.section ?? null,
  }))

  const viewLogHref = (studentId: string) => {
    const params = new URLSearchParams()
    if (className) params.set('class', className)
    if (section) params.set('section', section)
    const query = params.toString()
    return `/school/attendance/student-log/${studentId}${query ? `?${query}` : ''}`
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.studentLogTitle', lang)}</h1>
        <Link
          href="/school"
          aria-label={t('common.back', lang)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      </div>

      <AttendanceTabs active="/school/attendance/student-log" lang={lang} />

      <Form className="mb-4 grid gap-3 rounded-lg border border-line bg-paper p-5 sm:grid-cols-2" action="/school/attendance/student-log">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
          <select name="classSection" defaultValue={classSection} className={selectClass({ fullWidth: true })}>
            <option value="">{t('attendance.allClasses', lang)}</option>
            {combos.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </div>
      </Form>

      {!visible.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">
          {t('attendance.none', lang)}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-paper">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('attendance.rollCol', lang)}</th>
                <th className={thClass}>{t('attendance.nameCol', lang)}</th>
                <th className={thClass}>{t('attendance.class', lang)}</th>
                <th className={thClass}>{t('attendance.section', lang)}</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className={tdClass}>{s.roll_number ?? '—'}</td>
                  <td className={tdClass}>{s.full_name}</td>
                  <td className={tdClass}>{s.class_name ?? '—'}</td>
                  <td className={tdClass}>{s.section ?? '—'}</td>
                  <td className={`${tdClass} text-right`}>
                    <Link
                      href={viewLogHref(s.id)}
                      className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                    >
                      {t('attendance.viewLog', lang)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
