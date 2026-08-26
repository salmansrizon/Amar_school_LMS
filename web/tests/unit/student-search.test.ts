import { describe, it, expect } from 'vitest'
import { STUDENT_SEARCH } from '@/lib/school-search'

describe('STUDENT_SEARCH', () => {
  it('covers every destination in the student shell', () => {
    const hrefs = STUDENT_SEARCH.map((e) => e.href)
    for (const href of [
      '/student',
      '/student/routine',
      '/student/notices',
      '/student/tasks',
      '/student/materials',
      '/student/results',
      '/student/exams',
      '/student/attendance',
      '/student/leave',
      '/student/fees',
      '/student/questions',
      '/student/profile',
    ]) {
      expect(hrefs, href).toContain(href)
    }
  })

  it('carries Bangla keywords alongside English, as the school list does', () => {
    // Bangla is the default a student reads (ADR 0004); an English-only keyword
    // list would make the palette useless for most of them.
    const bengali = /[ঀ-৿]/
    for (const entry of STUDENT_SEARCH) {
      expect(entry.keywords.some((k) => bengali.test(k)), entry.href).toBe(true)
      expect(entry.keywords.some((k) => /^[\x20-\x7E]+$/.test(k)), entry.href).toBe(true)
    }
  })

  it('points only inside the student portal', () => {
    // A hit that navigates to /school would bounce a Student off their own
    // route group via canAccess.
    for (const entry of STUDENT_SEARCH) {
      expect(entry.href.startsWith('/student'), entry.href).toBe(true)
    }
  })

  it('has no duplicate destinations', () => {
    const hrefs = STUDENT_SEARCH.map((e) => e.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
