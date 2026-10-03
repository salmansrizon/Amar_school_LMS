import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProgressReportTemplate } from '@/app/school/exams/[id]/progress-report/[studentId]/templates'
import { assembleRosterRows } from '@/lib/exam-print-data'
import type { GradingScheme } from '@/lib/grading'
import { t } from '@/lib/i18n'

// A mark never entered prints as "marks not entered" on the progress report —
// not as "0 / 100" with a fail grade. The row comes from the same assembly the
// Result Book and mark sheet read (assembleRosterRows), not a second one.

const scheme: GradingScheme = {
  schemeType: 'grade_point',
  passMarkPercent: 33,
  passRuleStrategy: 'individual',
  combineSubjectGroups: false,
  bands: [
    { label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
    { label: 'F', minPercent: 0, maxPercent: 32.99, gradePoint: 0 },
  ],
} as unknown as GradingScheme

const subjects = [
  { id: 'bn', name: 'Bangla', theory_marks: 100, mcq_marks: 0, practical_marks: 0 },
  { id: 'en', name: 'English', theory_marks: 100, mcq_marks: 0, practical_marks: 0 },
]
const roster = [{ id: 'st', full_name: 'Student', roll_number: 1, guardian_name: null }]

function render(marks: [string, number][]) {
  const [row] = assembleRosterRows(subjects, roster, new Map(marks), new Map(), scheme, 'grade')
  const html = renderToStaticMarkup(
    <ProgressReportTemplate
      lang="en"
      institute={{ name: 'School' } as never}
      examLabel="Exam 2026"
      studentName="Student"
      roll="1"
      classSection="6 - A"
      attendancePercent={null}
      subjectRows={row.subjectResults.map((r) => ({
        subjectId: r.subjectId,
        name: r.subjectName,
        full: r.result.fullMarks,
        obtained: r.result.obtainedMarks,
        label: r.result.label,
        passed: r.result.passed,
        entered: r.entered,
      }))}
      behaviourRows={[]}
      checklistItems={[]}
      rankPosition={row.rankPosition}
      rankOutOf={row.rankOutOf}
      qrSvg=""
      template={2}
    />,
  )
  return { row, html }
}

describe('progress report with a mark not entered', () => {
  it('prints "marks not entered" for that subject, with no 0 and no fail grade', () => {
    const { row, html } = render([['st:bn', 90]])
    expect(row.marksMissing).toBe(1)
    expect(html).toContain(t('exams.marksNotEntered', 'en'))
    expect(html).toContain('>— / 100<')
    expect(html).not.toContain('>0 / 100<')
    expect(html).not.toContain('>F<')
    // An incomplete result holds no merit position.
    expect(html).not.toContain(t('promotion.position', 'en'))
  })

  it('leaves a complete result exactly as it was', () => {
    const { row, html } = render([
      ['st:bn', 90],
      ['st:en', 10],
    ])
    expect(row.marksMissing).toBe(0)
    expect(html).not.toContain(t('exams.marksNotEntered', 'en'))
    expect(html).toContain('>F<')
    expect(html).toContain('>A+<')
  })
})
