import { classCatalogueLabel } from '@/lib/class-catalogue'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { schoolToday } from '@/lib/school-time'
import { loadDirectoryRows } from '../directory-rows'
import { csvCell } from '@/lib/csv'

// CSV of the directory's current filter (map 013, P1) — same rows as the list.

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const lang = await currentLang()
  const { rows, fees, showYear } = await loadDirectoryRows(params)
  const header = [
    t('students.studentNo', lang),
    t('students.name', lang),
    t('students.roll', lang),
    t('students.classSection', lang),
    t('students.guardian', lang),
    t('students.guardianMobile', lang),
    t('students.feeStanding', lang),
  ]
  const lines = rows.map((s) => {
    const f = fees.get(s.id)
    const cls = s.class_name
      ? classCatalogueLabel(
          { name: s.class_name, section: s.section, group_department: s.group_department, shift: s.shift, academic_year: s.academic_year },
          showYear,
        )
      : ''
    const fee = f ? `${t(f.standing === 'paid' ? 'students.feePaid' : f.standing === 'partial' ? 'students.feePartial' : 'students.feeDue', lang)}${f.standing === 'paid' ? '' : ` ${f.due}`}` : ''
    return [s.student_no, s.full_name, s.roll_number, cls, s.guardian_name, s.guardian_mobile, fee].map(csvCell).join(',')
  })
  // BOM so Excel opens Bangla as UTF-8.
  const body = '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n')
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="students-${schoolToday()}.csv"`,
    },
  })
}
