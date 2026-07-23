// Notice-board seat plan (issue #96, map #91, docs/improvement.md §2B).
//
// With mixed seating (grilling decision 9) one room can carry several exams,
// classes, sections and subjects at once, so the print is organised by ROOM —
// the thing a student walks up to — with one line per exam seated in it.
//
// The model stays range-based: no per-desk seat numbers (map #91 fog-grilling,
// 2026-07-23 — per-desk numbering is a public-exam-centre practice, and the
// anti-cheating goal is met by interleaving rolls, not numbering desks). What
// a mixed room does need is the COMBINED roll list, computed here at print
// time and never persisted, so a student confirms "my roll is in Room 203"
// without eyeballing several overlapping ranges.

export interface SeatAllocation {
  id: string
  room_id: string
  roll_start: number
  roll_end: number
  examName: string
  className: string
  section: string | null
  subject: string | null
}

export interface PrintRoom {
  id: string
  name: string
  capacity: number
  buildingName: string
}

export interface RoomNoticeBlock {
  room: PrintRoom
  buildingName: string
  rows: SeatAllocation[]
  /** Seats this room owes across every exam in it. */
  seatCount: number
}

/** One block per occupied room, ordered by building then room name. Rooms
 *  nobody sits in are left out — a notice board listing empty rooms wastes the
 *  reader's attention. */
export function roomNoticeBlocks(
  allocations: SeatAllocation[],
  rooms: PrintRoom[],
): RoomNoticeBlock[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const byRoom = new Map<string, SeatAllocation[]>()
  for (const allocation of allocations) {
    if (!roomById.has(allocation.room_id)) continue
    const list = byRoom.get(allocation.room_id) ?? []
    list.push(allocation)
    byRoom.set(allocation.room_id, list)
  }

  return [...byRoom.entries()]
    .map(([roomId, rows]) => {
      const room = roomById.get(roomId)!
      return {
        room,
        buildingName: room.buildingName,
        rows,
        seatCount: rows.reduce((n, r) => n + (r.roll_end - r.roll_start + 1), 0),
      }
    })
    .sort((a, b) =>
      a.buildingName === b.buildingName
        ? a.room.name.localeCompare(b.room.name)
        : a.buildingName.localeCompare(b.buildingName),
    )
}

/** Every roll seated in the room, from all exams, sorted and de-duplicated.
 *  Computed at print time — deliberately not stored. */
export function combinedRollList(rows: { roll_start: number; roll_end: number }[]): number[] {
  const rolls = new Set<number>()
  for (const row of rows) {
    for (let roll = row.roll_start; roll <= row.roll_end; roll++) rolls.add(roll)
  }
  return [...rolls].sort((a, b) => a - b)
}

/** Re-collapse a roll list into readable runs — "1–3, 101–102" rather than
 *  twenty numbers, which is what a notice board can actually be read from. */
export function formatRollRanges(rolls: number[]): string {
  if (!rolls.length) return ''
  const parts: string[] = []
  let start = rolls[0]
  let prev = rolls[0]
  for (const roll of rolls.slice(1)) {
    if (roll === prev + 1) {
      prev = roll
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = roll
    prev = roll
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`)
  return parts.join(', ')
}
