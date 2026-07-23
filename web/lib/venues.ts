// Examination venues (issue #93, map #91, docs/improvement.md §2A): buildings
// and the rooms inside them, configured as institute master data and reused by
// every exam's seat plan. Pure — the Venues tab and the seat-plan screens both
// compose these, and the DB constraints in migration 0057 are the authority.

/** The building migration 0057 auto-creates for every school; existing flat
 *  rooms were attached to it, so it always exists and is never orphaned. */
export const MAIN_BUILDING_NAME = 'Main Building'

export interface BuildingRow {
  id: string
  name: string
}

export interface RoomRow {
  id: string
  building_id: string
  name: string
  capacity: number
  is_active: boolean
}

export interface BuildingWithRooms extends BuildingRow {
  rooms: RoomRow[]
}

/** Buildings in the order given, each carrying its own rooms in the order
 *  given. A building with no rooms stays — it is still configurable. */
export function buildingRoomTree(buildings: BuildingRow[], rooms: RoomRow[]): BuildingWithRooms[] {
  return buildings.map((b) => ({ ...b, rooms: rooms.filter((r) => r.building_id === b.id) }))
}

/** Seats a building can actually offer: inactive rooms seat nobody. */
export function buildingCapacity(building: BuildingWithRooms): number {
  return building.rooms.reduce((sum, r) => sum + (r.is_active ? r.capacity : 0), 0)
}

/** Rooms are only unique within their building, so anything naming a room to a
 *  human names its building too. A room with no building name still prints
 *  something usable rather than a dangling dash. */
export function roomVenueLabel(buildingName: string | null | undefined, roomName: string): string {
  return buildingName ? `${buildingName} — ${roomName}` : roomName
}

/** PostgREST returns an embedded `buildings(name)` join as an object the
 *  generated types widen to unknown; every caller was casting it by hand. */
export function embeddedBuildingName(row: { buildings?: unknown }): string {
  const embedded = row.buildings as { name?: string } | { name?: string }[] | null | undefined
  if (!embedded) return ''
  return (Array.isArray(embedded) ? embedded[0]?.name : embedded.name) ?? ''
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export type BuildingError = 'buildingNameRequired' | 'buildingNameDuplicate'

export function validateBuilding(
  input: { name: string; id?: string },
  existing: BuildingRow[],
): BuildingError | null {
  if (!input.name.trim()) return 'buildingNameRequired'
  const clash = existing.some((b) => b.id !== input.id && normalize(b.name) === normalize(input.name))
  return clash ? 'buildingNameDuplicate' : null
}

export type RoomError =
  | 'roomNameRequired'
  | 'roomBuildingRequired'
  | 'roomCapacityInvalid'
  | 'roomNameDuplicate'

export function validateRoom(
  input: { name: string; capacity: number; building_id: string; id?: string },
  existing: RoomRow[],
): RoomError | null {
  if (!input.name.trim()) return 'roomNameRequired'
  if (!input.building_id) return 'roomBuildingRequired'
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return 'roomCapacityInvalid'
  const clash = existing.some(
    (r) =>
      r.id !== input.id &&
      r.building_id === input.building_id &&
      normalize(r.name) === normalize(input.name),
  )
  return clash ? 'roomNameDuplicate' : null
}
