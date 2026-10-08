import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/i18n-server', () => ({ currentLang: async () => 'en' }))
vi.mock('@/lib/school/context', () => ({ getSchoolContext: async () => ({}) }))

import {
  attendanceGroupsFor,
  employeeAttendanceAdminDenied,
  isEmployeeAttendanceAdminPath,
  mayAdministerEmployeeAttendance,
  scopeAdministersEmployeeAttendance,
} from '@/lib/school/employee-attendance-admin'
import { t } from '@/lib/i18n'

// #677: employee attendance administration is Owner and office staff only.
const client = (scope: unknown, error = false) =>
  ({ rpc: vi.fn(async () => (error ? { data: null, error: { message: 'x' } } : { data: scope, error: null })) }) as unknown as SupabaseClient

describe('employee attendance admin (#677)', () => {
  it('only the school-wide scope administers', () => {
    expect(scopeAdministersEmployeeAttendance('school-wide')).toBe(true)
    for (const scope of ['attached', 'none', null, undefined, '', true]) {
      expect(scopeAdministersEmployeeAttendance(scope)).toBe(false)
    }
  })

  it('Owner / office staff pass; a teacher, an unassigned employee and an RPC failure are refused', async () => {
    expect(await mayAdministerEmployeeAttendance(client('school-wide'))).toBe(true)
    expect(await mayAdministerEmployeeAttendance(client('attached'))).toBe(false)
    expect(await mayAdministerEmployeeAttendance(client('none'))).toBe(false)
    expect(await mayAdministerEmployeeAttendance(client('school-wide', true))).toBe(false)
  })

  it('the action guard returns null when allowed and the localized refusal otherwise', async () => {
    expect(await employeeAttendanceAdminDenied(client('school-wide'))).toBeNull()
    expect(await employeeAttendanceAdminDenied(client('attached'))).toEqual({ error: t('denied.title', 'en') })
  })

  it('a teacher keeps Students and the Off-Day Calendar, and loses Employees and Machine', () => {
    expect(attendanceGroupsFor(true).map((g) => g.id)).toEqual(['students', 'employees', 'off-days', 'machine'])
    expect(attendanceGroupsFor(false).map((g) => g.id)).toEqual(['students', 'off-days'])
  })

  it('names the employee-administration routes and nothing else', () => {
    for (const path of [
      '/school/attendance/employee',
      '/school/attendance/employee/office-hour',
      '/school/attendance/employee/grace-time',
      '/school/attendance/leave/employee',
      '/school/attendance/machine',
      '/school/attendance/machine/students',
      '/school/attendance/machine/employees',
    ]) {
      expect(isEmployeeAttendanceAdminPath(path)).toBe(true)
    }
    for (const path of [
      '/school/attendance',
      '/school/attendance/mark',
      '/school/attendance/book',
      '/school/attendance/student-log',
      '/school/attendance/leave/student',
      '/school/attendance/off-days',
      '/school/attendance/employees-fake',
    ]) {
      expect(isEmployeeAttendanceAdminPath(path)).toBe(false)
    }
  })
})
