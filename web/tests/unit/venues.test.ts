import { describe, it, expect } from 'vitest'
import {
  MAIN_BUILDING_NAME,
  buildingRoomTree,
  buildingCapacity,
  roomVenueLabel,
  embeddedBuildingName,
  validateBuilding,
  validateRoom,
  type BuildingRow,
  type RoomRow,
} from '@/lib/venues'

// Seam: examination venues as institute master data (issue #93, map #91,
// docs/improvement.md §2A) — buildings hold rooms, rooms hold capacity.

const buildings: BuildingRow[] = [
  { id: 'b1', name: 'Academic Building' },
  { id: 'b2', name: MAIN_BUILDING_NAME },
]

const rooms: RoomRow[] = [
  { id: 'r1', building_id: 'b2', name: 'Room 101', capacity: 80, is_active: true },
  { id: 'r2', building_id: 'b2', name: 'Room 103', capacity: 60, is_active: true },
  { id: 'r3', building_id: 'b1', name: 'Lab-1', capacity: 40, is_active: false },
]

describe('buildingRoomTree', () => {
  it('groups rooms under their building, buildings in the given order', () => {
    const tree = buildingRoomTree(buildings, rooms)
    expect(tree.map((b) => b.name)).toEqual(['Academic Building', MAIN_BUILDING_NAME])
    expect(tree[0].rooms.map((r) => r.name)).toEqual(['Lab-1'])
    expect(tree[1].rooms.map((r) => r.name)).toEqual(['Room 101', 'Room 103'])
  })

  it('keeps a building with no rooms in the tree (it is still configurable)', () => {
    const tree = buildingRoomTree([{ id: 'b9', name: 'New Block' }], [])
    expect(tree).toHaveLength(1)
    expect(tree[0].rooms).toEqual([])
  })
})

describe('buildingCapacity', () => {
  it('sums only the active rooms — an inactive room seats nobody', () => {
    const tree = buildingRoomTree(buildings, rooms)
    expect(buildingCapacity(tree[1])).toBe(140)
    expect(buildingCapacity(tree[0])).toBe(0)
  })
})

describe('roomVenueLabel', () => {
  it('names the building and the room, since room names repeat across buildings', () => {
    expect(roomVenueLabel('Academic Building', 'Room 101')).toBe('Academic Building — Room 101')
  })
})

describe('validateBuilding', () => {
  it('requires a name', () => {
    expect(validateBuilding({ name: '  ' }, [])).toBe('buildingNameRequired')
  })

  it('rejects a name already used in this school (the DB constraint, surfaced early)', () => {
    expect(validateBuilding({ name: 'Academic Building' }, buildings)).toBe('buildingNameDuplicate')
    // Case- and whitespace-insensitive: the user means the same building.
    expect(validateBuilding({ name: ' academic building ' }, buildings)).toBe('buildingNameDuplicate')
  })

  it('allows a rename that keeps the row its own name', () => {
    expect(validateBuilding({ name: 'Academic Building', id: 'b1' }, buildings)).toBeNull()
  })

  it('accepts a fresh name', () => {
    expect(validateBuilding({ name: 'Building B' }, buildings)).toBeNull()
  })
})

describe('validateRoom', () => {
  const input = { name: 'Room 205', capacity: 50, building_id: 'b1' }

  it('accepts a well-formed room', () => {
    expect(validateRoom(input, rooms)).toBeNull()
  })

  it('requires a name and a building', () => {
    expect(validateRoom({ ...input, name: '' }, rooms)).toBe('roomNameRequired')
    expect(validateRoom({ ...input, building_id: '' }, rooms)).toBe('roomBuildingRequired')
  })

  it('requires a positive whole capacity', () => {
    expect(validateRoom({ ...input, capacity: 0 }, rooms)).toBe('roomCapacityInvalid')
    expect(validateRoom({ ...input, capacity: -5 }, rooms)).toBe('roomCapacityInvalid')
    expect(validateRoom({ ...input, capacity: 12.5 }, rooms)).toBe('roomCapacityInvalid')
  })

  it('rejects a duplicate room name within the same building only', () => {
    expect(validateRoom({ ...input, name: 'Room 101', building_id: 'b2' }, rooms)).toBe(
      'roomNameDuplicate',
    )
    // Same name in a different building is the normal case, not an error.
    expect(validateRoom({ ...input, name: 'Room 101', building_id: 'b1' }, rooms)).toBeNull()
  })

  it('allows a room to keep its own name while being edited', () => {
    expect(validateRoom({ ...input, id: 'r1', name: 'Room 101', building_id: 'b2' }, rooms)).toBeNull()
  })
})

// Extracted during code review: three print pages were hand-casting the
// embedded join and inlining the label.
describe('roomVenueLabel / embeddedBuildingName', () => {
  it('falls back to the room alone rather than printing a dangling dash', () => {
    expect(roomVenueLabel(null, 'Room 101')).toBe('Room 101')
    expect(roomVenueLabel('', 'Room 101')).toBe('Room 101')
  })

  it('reads the embedded building name in either PostgREST shape', () => {
    expect(embeddedBuildingName({ buildings: { name: 'Science Block' } })).toBe('Science Block')
    expect(embeddedBuildingName({ buildings: [{ name: 'Science Block' }] })).toBe('Science Block')
  })

  it('is empty when the join came back null or absent', () => {
    expect(embeddedBuildingName({ buildings: null })).toBe('')
    expect(embeddedBuildingName({})).toBe('')
  })
})
