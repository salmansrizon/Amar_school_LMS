import { describe, it, expect } from 'vitest'
import { loadEmployeeAttendanceStarts, shouldFallBackToEmployeesRead } from '@/lib/school/employee-attendance-starts-source'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('shouldFallBackToEmployeesRead', () => {
  it('falls back on a missing function, any error, null or empty rows', () => {
    expect(shouldFallBackToEmployeesRead({ code: 'PGRST202' }, null)).toBe(true)
    expect(shouldFallBackToEmployeesRead({ code: '42883' }, null)).toBe(true)
    expect(shouldFallBackToEmployeesRead({ code: 'XX000' }, [{}])).toBe(true)
    expect(shouldFallBackToEmployeesRead(null, null)).toBe(true)
    expect(shouldFallBackToEmployeesRead(null, [])).toBe(true)
  })
  it('uses the function when it returned rows', () => {
    expect(shouldFallBackToEmployeesRead(null, [{ employee_id: 'e1' }])).toBe(false)
  })
})

function fakeClient(rpc: { data: unknown; error: { code?: string } | null }, table: unknown[]) {
  const builder = { is: () => builder, eq: () => builder, then: (f: (v: unknown) => unknown) => f({ data: table }) }
  return { rpc: async () => rpc, from: () => ({ select: () => builder }) } as unknown as SupabaseClient
}

describe('loadEmployeeAttendanceStarts', () => {
  it('maps the function rows (dates as YYYY-MM-DD)', async () => {
    const c = fakeClient({ data: [{ employee_id: 'e1', start_day: '2026-09-03' }, { employee_id: 'e2', start_day: null }], error: null }, [])
    expect([...(await loadEmployeeAttendanceStarts(c))]).toEqual([['e1', '2026-09-03'], ['e2', null]])
  })
  it('filters to one employee when asked', async () => {
    const c = fakeClient({ data: [{ employee_id: 'e1', start_day: '2026-09-03' }, { employee_id: 'e2', start_day: '2026-09-04' }], error: null }, [])
    expect([...(await loadEmployeeAttendanceStarts(c, 'e2'))]).toEqual([['e2', '2026-09-04']])
  })
  it('before 0220: reads employees and applies the later-of rule', async () => {
    const c = fakeClient({ data: null, error: { code: 'PGRST202' } }, [
      { id: 'e1', joining_date: '2020-01-01', created_at: '2026-10-03T03:00:00Z' },
      { id: 'e2', joining_date: null, created_at: null },
    ])
    expect([...(await loadEmployeeAttendanceStarts(c))]).toEqual([['e1', '2026-10-03'], ['e2', null]])
  })
})
