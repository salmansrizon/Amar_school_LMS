import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GradingScheme } from '@/lib/grading'
import type { ResultRow } from '@/lib/student/results'
import { t } from '@/lib/i18n'

// The Student's own result page: a subject of her class with no mark makes the
// result incomplete — no GPA, no pass/fail, no position — the reading the
// school's Result Book and mark sheet already give. Rendered through the real
// page with a stand-in for the Student's database session.

const state = { rows: [] as ResultRow[] }
const classSubjects = [
  { id: 'bn', name: 'Bangla' },
  { id: 'en', name: 'English' },
]

const scheme: GradingScheme = {
  schemeType: 'grade_point',
  passMarkPercent: 33,
  passRuleStrategy: 'individual',
  combineSubjectGroups: false,
  bands: [
    { label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
    { label: 'F', minPercent: 0, maxPercent: 79.99, gradePoint: 0 },
  ],
}

function query(data: unknown) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) q[m] = () => q
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null })
  return q
}
const supabase = {
  from: (table: string) => query(table === 'student_exam_result' ? state.rows : classSubjects),
  rpc: async () => ({ data: [{ rank: 1, out_of: 7 }], error: null }),
}

vi.mock('@/lib/i18n-server', () => ({ currentLang: async () => 'en' }))
vi.mock('@/lib/student/context', () => ({ getStudentContext: async () => ({ supabase }) }))
vi.mock('@/lib/grading-scheme-loader', () => ({ loadGradingScheme: async () => scheme }))
vi.mock('@/components/print/print-trigger', () => ({ PrintTrigger: () => null }))

import StudentResultPage from '@/app/student/results/[examId]/page'

const row = (subject_id: string, subject_name: string, obtained: number): ResultRow => ({
  exam_id: 'e1',
  exam_name: 'Midterm',
  exam_year: 2026,
  results_published_at: '2026-01-01',
  grading_scheme_id: 's1',
  subject_id,
  subject_name,
  subject_theory_total: 100,
  subject_mcq_total: 0,
  subject_practical_total: 0,
  theory_obtained: obtained,
  mcq_obtained: 0,
  practical_obtained: 0,
  obtained_marks: obtained,
})

async function render(rows: ResultRow[]) {
  state.rows = rows
  return renderToStaticMarkup(await StudentResultPage({ params: Promise.resolve({ examId: 'e1' }) }))
}

describe('student portal result', () => {
  it('shows Incomplete and "marks not entered" when a subject has no mark — never pass, fail, GPA or rank', async () => {
    const html = await render([row('bn', 'Bangla', 90)])
    expect(html).toContain(t('exams.incomplete', 'en'))
    expect(html).toContain(t('exams.marksNotEntered', 'en'))
    expect(html).toContain('English')
    expect(html).not.toContain(t('student.passed', 'en'))
    expect(html).not.toContain(t('student.failed', 'en'))
    expect(html).not.toContain(t('student.rank', 'en'))
    // The GPA and grade tiles are dashes, not the 5 / A+ of the one entered subject.
    expect(html).not.toMatch(/text-brand-700">5</)
  })

  it('shows a complete result exactly as before', async () => {
    const html = await render([row('bn', 'Bangla', 90), row('en', 'English', 85)])
    expect(html).toContain(t('student.passed', 'en'))
    expect(html).toContain(t('student.rank', 'en'))
    expect(html).toMatch(/text-brand-700">5</)
    expect(html).not.toContain(t('exams.incomplete', 'en'))
    expect(html).not.toContain(t('exams.marksNotEntered', 'en'))
  })

  it('still shows a complete fail as a fail', async () => {
    const html = await render([row('bn', 'Bangla', 90), row('en', 'English', 10)])
    expect(html).toContain(t('student.failed', 'en'))
    expect(html).not.toContain(t('exams.incomplete', 'en'))
  })
})
