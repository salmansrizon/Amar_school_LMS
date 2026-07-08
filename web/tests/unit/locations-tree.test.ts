import { describe, it, expect } from 'vitest'
import { buildTree, childType } from '@/lib/locations'

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
