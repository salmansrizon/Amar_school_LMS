import { describe, it, expect } from 'vitest'
import {
  roomNoticeBlocks,
  combinedRollList,
  formatRollList,
  type SeatAllocation,
  type PrintRoom,
} from '@/lib/seat-plan-print'

// Seam: the notice-board seat plan (issue #96, map #91, docs/improvement.md
// §2B). With mixed seating one room block carries several exams, so the union
// roll list is what lets a student find their own room at a glance.

const rooms: PrintRoom[] = [
  { id: 'r1', name: 'Room 101', capacity: 40, buildingName: 'Academic Building' },
  { id: 'r2', name: 'Room 201', capacity: 30, buildingName: 'Academic Building' },
  { id: 'r3', name: 'Lab-1', capacity: 20, buildingName: 'Science Block' },
]

const allocations: SeatAllocation[] = [
  {
    id: 'a1',
    room_id: 'r1',
    roll_start: 1,
    roll_end: 10,
    examName: 'Half Yearly 2026',
    className: 'Six',
    section: 'A',
    subject: 'Bangla 1st Paper',
  },
  {
    id: 'a2',
    room_id: 'r1',
    roll_start: 101,
    roll_end: 105,
    examName: 'Half Yearly 2026',
    className: 'Seven',
    section: 'B',
    subject: 'English',
  },
  {
    id: 'a3',
    room_id: 'r3',
    roll_start: 200,
    roll_end: 204,
    examName: 'Half Yearly 2026',
    className: 'Eight',
    section: null,
    subject: null,
  },
]

describe('roomNoticeBlocks', () => {
  it('makes one block per occupied room, ordered by building then room', () => {
    const blocks = roomNoticeBlocks(allocations, rooms)
    expect(blocks.map((b) => b.room.name)).toEqual(['Room 101', 'Lab-1'])
    expect(blocks[0].buildingName).toBe('Academic Building')
  })

  it('omits rooms nobody was seated in — a notice board should not list empty rooms', () => {
    const blocks = roomNoticeBlocks(allocations, rooms)
    expect(blocks.some((b) => b.room.id === 'r2')).toBe(false)
  })

  it('carries every exam, class, section and subject seated in a mixed room', () => {
    const [first] = roomNoticeBlocks(allocations, rooms)
    expect(first.rows).toHaveLength(2)
    expect(first.rows.map((r) => r.className)).toEqual(['Six', 'Seven'])
    expect(first.rows[1].subject).toBe('English')
  })

  it('counts the seats a room actually owes', () => {
    const [first] = roomNoticeBlocks(allocations, rooms)
    expect(first.seatCount).toBe(15)
  })

  it('drops allocations pointing at a room that no longer exists', () => {
    const blocks = roomNoticeBlocks(
      [...allocations, { ...allocations[0], id: 'ghost', room_id: 'gone' }],
      rooms,
    )
    expect(blocks.every((b) => b.room.id !== 'gone')).toBe(true)
  })
})

describe('combinedRollList', () => {
  it('unions every exam in the room into one sorted roll list', () => {
    const [first] = roomNoticeBlocks(allocations, rooms)
    expect(combinedRollList(first.rows)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 101, 102, 103, 104, 105,
    ])
  })

  it('de-duplicates rolls that repeat across exams (different classes, same number)', () => {
    const list = combinedRollList([
      { roll_start: 1, roll_end: 3 },
      { roll_start: 2, roll_end: 4 },
    ])
    expect(list).toEqual([1, 2, 3, 4])
  })

  it('is empty for a room with no allocations', () => {
    expect(combinedRollList([])).toEqual([])
  })
})

describe('formatRollList', () => {
  it('spells every roll out in order rather than collapsing to ranges', () => {
    // #96's refinement: a student must not have to reason about ranges.
    expect(formatRollList([1, 2, 3, 4, 5])).toBe('1, 2, 3, 4, 5')
  })

  it('keeps rolls from several exams in one ordered run of numbers', () => {
    expect(formatRollList([1, 2, 3, 101, 102])).toBe('1, 2, 3, 101, 102')
  })

  it('prints a lone roll as itself', () => {
    expect(formatRollList([7])).toBe('7')
  })

  it('is empty for no rolls', () => {
    expect(formatRollList([])).toBe('')
  })
})
