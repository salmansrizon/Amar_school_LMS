import { describe, it, expect } from 'vitest'
import { buildChecklistRows, sortCocurricularItems } from '@/lib/cocurricular'

describe('buildChecklistRows: merges configured items with one student\'s checked ids (issue #33)', () => {
  const items = [
    { id: 'a', label: 'Sports', sort_order: 1 },
    { id: 'b', label: 'Scouting', sort_order: 2 },
    { id: 'c', label: 'Debate', sort_order: 3 },
  ]

  it('flags checked items and leaves the rest unchecked', () => {
    const rows = buildChecklistRows(items, new Set(['a', 'c']))
    expect(rows).toEqual([
      { id: 'a', label: 'Sports', checked: true },
      { id: 'b', label: 'Scouting', checked: false },
      { id: 'c', label: 'Debate', checked: true },
    ])
  })

  it('an empty checked set leaves every row unchecked', () => {
    const rows = buildChecklistRows(items, new Set())
    expect(rows.every((r) => !r.checked)).toBe(true)
  })
})

describe('sortCocurricularItems: sort_order then label tiebreaker', () => {
  it('sorts by sort_order ascending', () => {
    const items = [
      { id: 'a', label: 'Zebra', sort_order: 2 },
      { id: 'b', label: 'Apple', sort_order: 1 },
    ]
    expect(sortCocurricularItems(items).map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('breaks a sort_order tie by label', () => {
    const items = [
      { id: 'a', label: 'Zebra', sort_order: 1 },
      { id: 'b', label: 'Apple', sort_order: 1 },
    ]
    expect(sortCocurricularItems(items).map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the input array', () => {
    const items = [
      { id: 'a', label: 'Zebra', sort_order: 2 },
      { id: 'b', label: 'Apple', sort_order: 1 },
    ]
    const original = [...items]
    sortCocurricularItems(items)
    expect(items).toEqual(original)
  })
})
