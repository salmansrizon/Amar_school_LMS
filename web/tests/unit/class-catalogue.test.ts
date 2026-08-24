import { describe, it, expect } from 'vitest'
import {
  classCatalogueOptions,
  resolveClassCatalogueSelection,
  findClassCatalogueId,
  classCatalogueLabel,
  resolveClassSection,
} from '@/lib/class-catalogue'

const rows = [
  { id: 'id-nine-a', name: 'Nine', section: 'Morning - A' },
  { id: 'id-six-a', name: 'Six', section: 'Morning - A' },
  { id: 'id-ten', name: 'Ten', section: null },
  { id: 'id-nine-b', name: 'Nine', section: 'Day - B' },
]

describe('classCatalogueOptions', () => {
  it('returns one option per row, sorted by class then section', () => {
    expect(classCatalogueOptions(rows)).toEqual([
      { value: 'id-nine-b', className: 'Nine', section: 'Day - B', label: 'Nine - Day - B' },
      { value: 'id-nine-a', className: 'Nine', section: 'Morning - A', label: 'Nine - Morning - A' },
      { value: 'id-six-a', className: 'Six', section: 'Morning - A', label: 'Six - Morning - A' },
      { value: 'id-ten', className: 'Ten', section: '', label: 'Ten' },
    ])
  })

  it('includes a class with zero enrolled students same as any other row', () => {
    const emptyClass = [{ id: 'id-empty', name: 'Eight', section: 'Morning - A' }]
    expect(classCatalogueOptions(emptyClass)).toEqual([
      { value: 'id-empty', className: 'Eight', section: 'Morning - A', label: 'Eight - Morning - A' },
    ])
  })

  it('returns nothing for an empty catalogue', () => {
    expect(classCatalogueOptions([])).toEqual([])
  })
})

describe('resolveClassCatalogueSelection', () => {
  const options = classCatalogueOptions(rows)

  it('resolves a picked id back to its class name and section', () => {
    expect(resolveClassCatalogueSelection(options, 'id-nine-a')).toEqual({ className: 'Nine', section: 'Morning - A' })
  })

  it('resolves a class with no section to an empty section string', () => {
    expect(resolveClassCatalogueSelection(options, 'id-ten')).toEqual({ className: 'Ten', section: '' })
  })

  it('resolves an empty id to the "All" pair', () => {
    expect(resolveClassCatalogueSelection(options, '')).toEqual({ className: '', section: '' })
  })

  it('resolves an unmatched id to the "All" pair', () => {
    expect(resolveClassCatalogueSelection(options, 'does-not-exist')).toEqual({ className: '', section: '' })
  })
})

describe('findClassCatalogueId', () => {
  const options = classCatalogueOptions(rows)

  it('finds the id for a matching class name and section', () => {
    expect(findClassCatalogueId(options, 'Nine', 'Morning - A')).toBe('id-nine-a')
  })

  it('finds the id for a class with no section', () => {
    expect(findClassCatalogueId(options, 'Ten', '')).toBe('id-ten')
  })

  it('returns the "All" value for an empty class name', () => {
    expect(findClassCatalogueId(options, '', '')).toBe('')
  })

  it('returns the "All" value when no row matches', () => {
    expect(findClassCatalogueId(options, 'Eleven', '')).toBe('')
  })
})

describe('resolveClassSection', () => {
  it('returns the same combos classCatalogueOptions would, plus the resolved selection', () => {
    expect(resolveClassSection(rows, 'id-nine-a')).toEqual({
      combos: classCatalogueOptions(rows),
      className: 'Nine',
      section: 'Morning - A',
    })
  })

  it('resolves an empty id to the "All" pair alongside the combos', () => {
    expect(resolveClassSection(rows, '')).toEqual({
      combos: classCatalogueOptions(rows),
      className: '',
      section: '',
    })
  })
})

describe('classCatalogueLabel', () => {
  it('joins class name and section with " - "', () => {
    expect(classCatalogueLabel({ name: 'Nine', section: 'Morning - A' })).toBe('Nine - Morning - A')
  })

  it('returns just the class name when section is null', () => {
    expect(classCatalogueLabel({ name: 'Ten', section: null })).toBe('Ten')
  })

  it('returns just the class name when section is an empty string', () => {
    expect(classCatalogueLabel({ name: 'Ten', section: '' })).toBe('Ten')
  })

  it('appends the group in parens when set, disambiguating rows that share a name and section', () => {
    expect(
      classCatalogueLabel({ name: 'Nine', section: 'Morning - A', group_department: 'Science' }),
    ).toBe('Nine - Morning - A (Science)')
    expect(
      classCatalogueLabel({ name: 'Nine', section: 'Morning - A', group_department: 'Humanities' }),
    ).toBe('Nine - Morning - A (Humanities)')
  })

  it('omits the group suffix when group_department is null, empty, or absent', () => {
    expect(classCatalogueLabel({ name: 'Ten', section: null, group_department: null })).toBe('Ten')
    expect(classCatalogueLabel({ name: 'Ten', section: null, group_department: '' })).toBe('Ten')
    expect(classCatalogueLabel({ name: 'Ten', section: null })).toBe('Ten')
  })
})

describe('classCatalogueOptions with duplicate name/section across groups', () => {
  it('labels each row distinctly by its group', () => {
    const dupRows = [
      { id: 'id-nine-science', name: 'Nine', section: 'Morning - A', group_department: 'Science' },
      { id: 'id-nine-humanities', name: 'Nine', section: 'Morning - A', group_department: 'Humanities' },
    ]
    expect(classCatalogueOptions(dupRows).map((o) => o.label)).toEqual([
      'Nine - Morning - A (Science)',
      'Nine - Morning - A (Humanities)',
    ])
  })
})
