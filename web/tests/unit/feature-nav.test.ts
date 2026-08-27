import { describe, expect, it } from 'vitest'
import { filterEnabledNav } from '@/lib/engines/feature/engine'
import { FEATURE_KEYS } from '@/lib/auth/screens'

describe('feature catalog', () => {
  it('has unique keys', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length)
  })
})

describe('filterEnabledNav', () => {
  const items = [{ key: 'students' }, { key: 'exams' }, { key: 'fees' }]

  it('keeps everything when nothing is disabled (behavior-preserving default)', () => {
    expect(filterEnabledNav(items, {})).toEqual(items)
  })

  it('drops only explicitly-disabled items', () => {
    expect(filterEnabledNav(items, { exams: false })).toEqual([{ key: 'students' }, { key: 'fees' }])
  })

  it('keeps items flagged enabled', () => {
    expect(filterEnabledNav(items, { exams: true, fees: false })).toEqual([
      { key: 'students' },
      { key: 'exams' },
    ])
  })
})
