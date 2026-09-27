import { describe, expect, it } from 'vitest'
import { navGroupFor, schoolNavGroupForScreen, SCHOOL_NAV_GROUPS } from '@/lib/school-nav'

describe('navGroupFor (map 013 F5)', () => {
  it.each([
    ['/school', 'overview', '/school'],
    ['/school/students', 'people', '/school/students'],
    ['/school/students/abc/edit', 'people', '/school/students'],
    ['/school/attendance/book', 'academics', '/school/attendance'],
    ['/school/exams', 'academics', '/school/exams'],
    ['/school/sms', 'financeComms', '/school/sms'],
    ['/school/corrections', 'financeComms', '/school/questions'],
    ['/school/questions/response', 'financeComms', '/school/questions'],
    ['/school/staff/x', 'administration', '/school/staff'],
  ])('%s -> %s group, entry %s', (path, group, href) => {
    const hit = navGroupFor(path)
    expect(hit?.group.key).toBe(group)
    expect(hit?.item.href).toBe(href)
  })

  it('returns null outside the sidebar, and never matches by bare prefix', () => {
    expect(navGroupFor('/school/profile')).toBeNull()
    expect(navGroupFor('/school/studentsx')).toBeNull()
    expect(navGroupFor('/admin')).toBeNull()
  })

  it('has the five reference groups in order', () => {
    expect(SCHOOL_NAV_GROUPS.map((g) => g.key)).toEqual([
      'overview',
      'people',
      'academics',
      'financeComms',
      'administration',
    ])
  })
})

// Backs the dashboard Quick Actions cards' category tag — proves the lookup
// finds a nested child screen (attendance lives under classes) and returns
// undefined rather than guessing for a screen with no sidebar entry.
describe('schoolNavGroupForScreen', () => {
  it.each([
    ['students', 'people'],
    ['attendance', 'academics'],
    ['fees', 'financeComms'],
    ['staff', 'administration'],
  ] as const)('%s -> %s', (screen, group) => {
    expect(schoolNavGroupForScreen(screen)?.key).toBe(group)
  })

  it('returns undefined for a screen with no sidebar entry', () => {
    expect(schoolNavGroupForScreen('approvals')).toBeUndefined()
  })
})
