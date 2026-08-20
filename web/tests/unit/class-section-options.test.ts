import { describe, it, expect } from 'vitest'
import { classSectionOptions, classSectionKey, parseClassSectionKey } from '@/lib/class-section-options'

const rows = [
  { class_name: 'Nine', section: 'Morning - A' },
  { class_name: 'Nine', section: 'Day - B' },
  { class_name: 'Nine', section: 'Morning - A' }, // duplicate combination
  { class_name: 'Six', section: 'Morning - A' },
  { class_name: 'Ten', section: null },
  { class_name: null, section: 'A' },
]

describe('classSectionOptions', () => {
  it('dedupes and sorts by class then section', () => {
    expect(classSectionOptions(rows)).toEqual([
      { value: classSectionKey('Nine', 'Day - B'), className: 'Nine', section: 'Day - B', label: 'Nine - Day - B' },
      {
        value: classSectionKey('Nine', 'Morning - A'),
        className: 'Nine',
        section: 'Morning - A',
        label: 'Nine - Morning - A',
      },
      { value: classSectionKey('Six', 'Morning - A'), className: 'Six', section: 'Morning - A', label: 'Six - Morning - A' },
      { value: classSectionKey('Ten', ''), className: 'Ten', section: '', label: 'Ten' },
    ])
  })

  it('skips rows without a class name', () => {
    expect(classSectionOptions(rows).some((o) => o.className === '')).toBe(false)
  })

  it('returns nothing for an empty roster', () => {
    expect(classSectionOptions([])).toEqual([])
  })
})

describe('classSectionKey / parseClassSectionKey', () => {
  it('round-trips a class and section that already contains " - "', () => {
    const key = classSectionKey('Nine', 'Morning - A')
    expect(parseClassSectionKey(key)).toEqual({ className: 'Nine', section: 'Morning - A' })
  })

  it('round-trips a class with no section', () => {
    const key = classSectionKey('Ten', '')
    expect(parseClassSectionKey(key)).toEqual({ className: 'Ten', section: '' })
  })

  it('parses an empty key as an empty class and section', () => {
    expect(parseClassSectionKey('')).toEqual({ className: '', section: '' })
  })
})
