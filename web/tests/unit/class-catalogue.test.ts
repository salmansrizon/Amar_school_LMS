import { describe, it, expect } from 'vitest'
import { classCatalogueOptions, resolveClassCatalogueSelection } from '@/lib/class-catalogue'

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
