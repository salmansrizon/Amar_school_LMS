import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPrintPath } from '@/lib/print-path'

// Map 013 T6: exam sheets reach the print preview popup through aliases under a
// /print segment, so the framing scope (isPrintPath, next.config) never widens.
const APP = join(__dirname, '../../app')
const ALIASES = [
  ['/school/exams/e1/print/all', 'school/exams/[id]/print/all'],
  ['/school/exams/e1/mark-sheet/s1/print', 'school/exams/[id]/mark-sheet/[studentId]/print'],
  ['/school/exams/e1/progress-report/s1/print', 'school/exams/[id]/progress-report/[studentId]/print'],
  ['/school/exams/e1/admit-cards/s1/print', 'school/exams/[id]/admit-cards/[studentId]/print'],
  ['/school/exams/e1/attendance-sheet/print', 'school/exams/[id]/attendance-sheet/print'],
] as const

describe('exam print aliases', () => {
  it.each(ALIASES)('%s is a print route with a page', (path, dir) => {
    expect(isPrintPath(path)).toBe(true)
    expect(existsSync(join(APP, dir, 'page.tsx'))).toBe(true)
  })

  it('leaves the non-sheet and chooser pages unframable', () => {
    for (const path of ['/school/exams/e1/printables', '/school/exams/e1/print-all', '/school/exams/e1/admit-cards'])
      expect(isPrintPath(path)).toBe(false)
  })
})
