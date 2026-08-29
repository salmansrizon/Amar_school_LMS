import { describe, it, expect } from 'vitest'
import { buildTree, childType, childrenAt } from '@/lib/locations'

describe('childType: the 4-level ladder', () => {
  it('descends division → district → upazila → union → null', () => {
    expect(childType('division')).toBe('district')
    expect(childType('district')).toBe('upazila')
    expect(childType('upazila')).toBe('union')
    expect(childType('union')).toBeNull()
  })
})

describe('buildTree', () => {
  it('nests children under parents and sorts by name', () => {
    const tree = buildTree([
      { id: 'd1', name: 'Dhaka', type: 'division', parent_id: null },
      { id: 'x1', name: 'Gazipur', type: 'district', parent_id: 'd1' },
      { id: 'x2', name: 'Dhaka District', type: 'district', parent_id: 'd1' },
      { id: 'u1', name: 'Sreepur', type: 'upazila', parent_id: 'x1' },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.name)).toEqual(['Dhaka District', 'Gazipur'])
    expect(tree[0].children[1].children[0].name).toBe('Sreepur')
  })
})

describe('childrenAt: one cascading-picker level at a time', () => {
  const rows = [
    { id: 'd1', name: 'Dhaka', type: 'division' as const, parent_id: null },
    { id: 'd2', name: 'Khulna', type: 'division' as const, parent_id: null },
    { id: 'x1', name: 'Gazipur', type: 'district' as const, parent_id: 'd1' },
    { id: 'x2', name: 'Dhaka District', type: 'district' as const, parent_id: 'd1' },
    { id: 'x3', name: 'Jessore', type: 'district' as const, parent_id: 'd2' },
    { id: 'u1', name: 'Sreepur', type: 'upazila' as const, parent_id: 'x1' },
  ]

  it('returns root divisions when parentId is null', () => {
    expect(childrenAt(rows, 'division', null).map((r) => r.name)).toEqual(['Dhaka', 'Khulna'])
  })

  it('returns only the districts under the given division, sorted', () => {
    expect(childrenAt(rows, 'district', 'd1').map((r) => r.name)).toEqual(['Dhaka District', 'Gazipur'])
    expect(childrenAt(rows, 'district', 'd2').map((r) => r.name)).toEqual(['Jessore'])
  })

  it('returns nothing for a level/parent combination with no matches', () => {
    expect(childrenAt(rows, 'upazila', 'x2')).toEqual([])
    expect(childrenAt(rows, 'union', 'u1')).toEqual([])
  })
})
