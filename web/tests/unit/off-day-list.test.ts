import { describe, it, expect } from 'vitest'
import { buildOffDayList } from '@/lib/employee-attendance-calendar'

describe('buildOffDayList (#692)', () => {
  const offDays = [
    { day: '2026-12-16', label: 'Victory Day', is_significant: true },
    { day: '2026-02-21', label: null, is_significant: false },
    { day: '2025-12-31', label: 'last year', is_significant: false },
    { day: '2026-10-07', label: 'Durga Puja', is_significant: false },
  ]
  it('keeps only the selected year, sorted by date, with weekday and source', () => {
    const { rows } = buildOffDayList(offDays, [5], 2026)
    expect(rows.map((r) => r.iso)).toEqual(['2026-02-21', '2026-10-07', '2026-12-16'])
    expect(rows.map((r) => r.weekday)).toEqual([6, 3, 3]) // Sat, Wed, Wed
    expect(rows.map((r) => r.source)).toEqual(['holiday', 'holiday', 'significant'])
  })
  it('summarises the weekly rule once instead of listing it', () => {
    const { weekly, rows } = buildOffDayList([], [6, 5, 5], 2026)
    expect(weekly).toEqual([5, 6])
    expect(rows).toEqual([])
  })
})
