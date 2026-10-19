import { describe, it, expect } from 'vitest'
import { STUDENT_NAV_GROUPS, studentGroupFor, studentGroupTabs } from '@/lib/student-nav'
import { STUDENT_SEARCH } from '@/lib/school-search'
import { t } from '@/lib/i18n'

// The 12 flat items the portal shipped with before the 5-group menu.
const OLD_ROUTES = [
  '/student', '/student/routine', '/student/notices', '/student/tasks',
  '/student/materials', '/student/results', '/student/exams', '/student/attendance',
  '/student/leave', '/student/fees', '/student/questions', '/student/profile',
]

describe('STUDENT_NAV_GROUPS', () => {
  it('has the five groups in tab order', () => {
    expect(STUDENT_NAV_GROUPS.map((g) => g.key)).toEqual(['overview', 'study', 'exams', 'attendance', 'money'])
  })

  it('orders items and lands each tab on its first item', () => {
    expect(STUDENT_NAV_GROUPS.map((g) => g.items.map((i) => i.href))).toEqual([
      ['/student', '/student/notices'],
      ['/student/tasks', '/student/routine', '/student/materials', '/student/questions'],
      ['/student/exams', '/student/results'],
      ['/student/attendance', '/student/leave'],
      ['/student/fees'],
    ])
  })

  it('lists each destination once; Profile is the only old route outside the menu', () => {
    const hrefs = STUDENT_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(OLD_ROUTES.filter((r) => !hrefs.includes(r))).toEqual(['/student/profile'])
  })

  it('has a bn and en label for every group and item', () => {
    for (const g of STUDENT_NAV_GROUPS) {
      for (const k of [g.labelKey, g.shortLabelKey, ...g.items.map((i) => i.titleKey)]) {
        expect(t(k, 'bn'), k).not.toBe(k)
        expect(t(k, 'en'), k).not.toBe(k)
      }
    }
  })
})

describe('studentGroupFor', () => {
  it('maps every old route to exactly one group (Profile and notifications to none)', () => {
    const expected: Record<string, string | null> = {
      '/student': 'overview',
      '/student/tasks': 'study',
      '/student/routine': 'study',
      '/student/materials': 'study',
      '/student/questions': 'study',
      '/student/exams': 'exams',
      '/student/results': 'exams',
      '/student/attendance': 'attendance',
      '/student/leave': 'attendance',
      '/student/fees': 'money',
      '/student/notices': 'overview',
      '/student/profile': null,
    }
    for (const route of OLD_ROUTES) {
      expect(studentGroupFor(route)?.group.key ?? null, route).toBe(expected[route])
    }
    expect(studentGroupFor('/student/notifications')).toBeNull()
  })

  it('matches nested routes by longest prefix; Home only matches itself', () => {
    expect(studentGroupFor('/student/results/abc')?.group.key).toBe('exams')
    expect(studentGroupFor('/student/tasks/abc')?.group.key).toBe('study')
    expect(studentGroupFor('/student/notices/abc')?.item.href).toBe('/student/notices')
    expect(studentGroupFor('/student/exams/abc/admit-card')?.group.key).toBe('exams')
    expect(studentGroupFor('/student/tasksfoo')).toBeNull()
    expect(studentGroupFor('/school')).toBeNull()
  })
})

describe('studentGroupTabs', () => {
  it('returns the group items as tabs, omitting zero or missing counts', () => {
    const tabs = studentGroupTabs('study', { tasks: 3, routine: 0 })
    expect(tabs.map((x) => x.href)).toEqual([
      '/student/tasks', '/student/routine', '/student/materials', '/student/questions',
    ])
    expect(tabs[0].count).toBe(3)
    expect(tabs[1].count).toBeUndefined()
    expect(tabs[2].count).toBeUndefined()
  })
})

describe('STUDENT_SEARCH vs the menu', () => {
  it('every entry resolves to a menu item or the profile route, and the menu has an entry', () => {
    const menu = STUDENT_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    for (const e of STUDENT_SEARCH) expect([...menu, '/student/profile'], e.href).toContain(e.href)
    for (const href of menu) expect(STUDENT_SEARCH.map((e) => e.href), href).toContain(href)
  })

  it('follows the menu group order', () => {
    const menu = STUDENT_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    expect(STUDENT_SEARCH.map((e) => e.href).slice(0, menu.length)).toEqual(menu)
  })
})
