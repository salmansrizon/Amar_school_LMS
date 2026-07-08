import { describe, it, expect } from 'vitest'
import { collapseTaps, employeeStatus } from '@/lib/attendance'

// Mirrors the SQL reconciliation rules (issue #10, CONTEXT/PRD §5.3):
// earliest tap = entry, latest tap = exit, everything between is noise.
describe('collapseTaps', () => {
  const at = (time: string) => new Date(`2026-07-08T${time}:00Z`)

  it('4+ taps collapse to earliest entry / latest exit', () => {
    const result = collapseTaps([at('12:05'), at('07:58'), at('09:30'), at('14:01')])
    expect(result).toEqual({ entry: at('07:58'), exit: at('14:01') })
  })

  it('a single tap is entry with no exit', () => {
    expect(collapseTaps([at('08:00')])).toEqual({ entry: at('08:00'), exit: null })
  })

  it('no taps → null', () => {
    expect(collapseTaps([])).toBeNull()
  })
})

describe('employeeStatus: applies shift window + Considerable Grace', () => {
  const at = (time: string) => new Date(`2026-07-08T${time}:00Z`)

  it('entry within start+grace is on time', () => {
    expect(employeeStatus(at('08:20'), at('13:55'), '08:00', '14:00', 25)).toBe('exit_early')
    expect(employeeStatus(at('08:20'), at('14:00'), '08:00', '14:00', 25)).toBe('on_time')
  })

  it('entry after start+grace is late', () => {
    expect(employeeStatus(at('08:26'), at('14:05'), '08:00', '14:00', 25)).toBe('late_entry')
  })

  it('exit before end is early exit', () => {
    expect(employeeStatus(at('08:00'), at('13:30'), '08:00', '14:00', 0)).toBe('exit_early')
  })

  it('late entry and early exit combine', () => {
    expect(employeeStatus(at('09:00'), at('12:00'), '08:00', '14:00', 15)).toBe('late_exit_early')
  })

  it('no shift window configured → plain present', () => {
    expect(employeeStatus(at('08:00'), at('14:00'), null, null, 30)).toBe('present')
  })
})
