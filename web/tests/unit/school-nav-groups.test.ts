import { describe, expect, it } from 'vitest'
import { navGroupFor, SCHOOL_NAV_GROUPS } from '@/lib/school-nav'

describe('navGroupFor (map 013 F5)', () => {
  it.each([
    ['/school', 'overview', '/school'],
    ['/school/students', 'people', '/school/students'],
    ['/school/students/abc/edit', 'people', '/school/students'],
    // Attendance is one sidebar item; every Attendance route belongs to it.
    ['/school/attendance/book', 'academics', '/school/attendance'],
    ['/school/attendance/employee/office-hour', 'academics', '/school/attendance'],
    ['/school/attendance/machine/students', 'academics', '/school/attendance'],
    ['/school/attendance', 'academics', '/school/attendance'],
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
