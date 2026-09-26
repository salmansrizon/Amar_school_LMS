import { describe, expect, it } from 'vitest'
import {
  latestMark,
  markedByOf,
  registerRows,
  resolveRosterStudent,
  rosterEmptyReason,
  rosterFor,
  searchRoster,
  type RosterStudent,
} from '@/lib/school/roster'

// The School roster model. Every case here was previously assembled inline in a
// page.tsx, below the last tested function and above the database — which is
// where both of this release's worst defects lived.
const student = (over: Partial<RosterStudent> & { id: string; full_name: string }): RosterStudent => ({
  roll_number: null,
  class_name: 'Six',
  section: 'A',
  guardian_name: null,
  class_offering_id: 'off-six-a',
  group_department: null,
  shift: null,
  academic_year: null,
  ...over,
})

describe('rosterEmptyReason', () => {
  it('is null while anything matched', () => {
    expect(rosterEmptyReason({ readable: 22, matched: 3, scope: 'attached' })).toBeNull()
  })

  // The defect this model exists to make impossible: students/page.tsx asked the
  // class-scope question against the UNFILTERED count and rendered the answer
  // over the FILTERED list, so a search matching nothing told an Owner their
  // school had no students — and offered to admit one.
  it('a filter that matched nothing is not an empty school', () => {
    expect(rosterEmptyReason({ readable: 22, matched: 0, scope: 'school-wide' })).toBe('no-match')
  })

  it('a school with nobody in it is', () => {
    expect(rosterEmptyReason({ readable: 0, matched: 0, scope: 'school-wide' })).toBe('no-students')
  })

  it('an Employee with no class attachment gets her own answer', () => {
    // ADR 0021: she reads no students by design. "No students yet" would be a
    // lie in a school of hundreds, and the admission form is not her way out.
    expect(rosterEmptyReason({ readable: 0, matched: 0, scope: 'none' })).toBe('unassigned')
  })
})

describe('rosterFor', () => {
  const roster: RosterStudent[] = [
    student({ id: 'c', full_name: 'Chameli', roll_number: 2 }),
    student({ id: 'a', full_name: 'Ayesha', roll_number: null }),
    student({ id: 'b', full_name: 'Babul', roll_number: 1 }),
    student({ id: 'd', full_name: 'Delwar', roll_number: 1, class_name: 'Seven', class_offering_id: 'off-seven-a' }),
  ]

  it('reads like a register: by roll, then the un-rolled by name', () => {
    // b and d both hold roll 1 — legal, because a roll is unique within a class
    // and these are two classes. The sort is stable, so they keep their input
    // order rather than swapping between renders.
    expect(rosterFor(roster, '').map((s) => s.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('narrows to one Class Offering', () => {
    expect(rosterFor(roster, 'off-seven-a').map((s) => s.id)).toEqual(['d'])
  })

  it('an empty class filter means the whole readable roster, not none', () => {
    expect(rosterFor(roster, '')).toHaveLength(4)
  })

  it('a student with no current Enrollment at all still appears in the unfiltered roster', () => {
    // Ported with the function: 33 students on the shared project carry no
    // current_enrollment_id, and dropping them from "All classes" would hide
    // real children.
    const unplaced = student({ id: 'e', full_name: 'Nusrat', class_name: null, section: null, class_offering_id: null })
    expect(rosterFor([...roster, unplaced], '').map((s) => s.id)).toEqual(['b', 'd', 'c', 'a', 'e'])
    // Ayesha has a class but no roll, so she sorts last inside it. Unplaced
    // Nusrat never matches a specific Offering filter.
    expect(rosterFor([...roster, unplaced], 'off-six-a').map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate its input', () => {
    const before = roster.map((s) => s.id)
    rosterFor(roster, '')
    expect(roster.map((s) => s.id)).toEqual(before)
  })
})

describe('searchRoster', () => {
  const roster: RosterStudent[] = [
    student({ id: 'a', full_name: 'Ayesha Akter', roll_number: 7, guardian_name: 'Rahim Uddin' }),
    student({ id: 'b', full_name: 'Babul Mia', roll_number: 12, guardian_name: 'Karim Mia' }),
  ]

  it('searches the three fields an office searches by', () => {
    expect(searchRoster(roster, 'ayesha').map((s) => s.id)).toEqual(['a'])
    expect(searchRoster(roster, 'karim').map((s) => s.id)).toEqual(['b'])
    expect(searchRoster(roster, '12').map((s) => s.id)).toEqual(['b'])
  })

  it('an empty term is not a filter', () => {
    expect(searchRoster(roster, '   ')).toHaveLength(2)
  })

  it('also finds a Student by Student Number or guardian mobile', () => {
    const withIds = [
      student({ id: 'c', full_name: 'Chaity', student_no: 'S0042', guardian_mobile: '01712850000' }),
      ...roster,
    ]
    expect(searchRoster(withIds, 's0042').map((s) => s.id)).toEqual(['c'])
    expect(searchRoster(withIds, '0171285').map((s) => s.id)).toEqual(['c'])
  })
})

describe('latestMark and markedByOf', () => {
  it('nobody has taken a register with no marks', () => {
    expect(latestMark([])).toBeNull()
    expect(markedByOf(null, 'Karim Mia', 'me')).toBeNull()
  })

  it('an RFID row is not somebody taking the register', () => {
    // The job writes attendance_records with no session; null marked_at is the
    // truth there — the machine marked it, nobody did (0170).
    expect(latestMark([{ marked_by: null, marked_at: null }])).toBeNull()
  })

  it('takes the later of the two tables', () => {
    const marks = [
      { marked_by: 'a', marked_at: '2026-08-28T09:00:00Z' },
      { marked_by: 'b', marked_at: '2026-08-28T10:42:00Z' },
      { marked_by: null, marked_at: null },
    ]
    expect(latestMark(marks)?.marked_by).toBe('b')
  })

  it('names the marker when their profile was readable, and says "you" when it is you', () => {
    const mark = { marked_by: 'me', marked_at: '2026-08-28T10:42:00Z' }
    expect(markedByOf(mark, 'Karim Mia', 'me')).toEqual({
      at: '2026-08-28T10:42:00Z',
      name: 'Karim Mia',
      isSelf: true,
    })
    // A Staff User may read only their own profile (0001), so a colleague's mark
    // shows the time without a name rather than failing.
    expect(markedByOf(mark, null, 'someone-else')).toEqual({
      at: '2026-08-28T10:42:00Z',
      name: null,
      isSelf: false,
    })
  })
})

describe('resolveRosterStudent', () => {
  // map 013 fix: the list showed "—" for a Student whose current-Enrollment
  // embed came back empty, even when the legacy class_name/section/roll_number
  // bridge (#587) still had a real value — the same value the record drawer
  // and the ID card already fall back to. This is the decision behind that fix.
  const row = {
    id: 'a',
    full_name: 'Ayesha',
    guardian_name: null,
    class_name: 'Six',
    section: 'A',
    roll_number: 4,
  }
  const enrollment = { roll_number: 9, class_offering_id: 'off-seven-b' }
  const offering = { name: 'Seven', section: 'B', group_department: 'Science', shift: 'Morning', academic_year: 2026 }

  it('prefers the current Enrollment when there is one', () => {
    expect(resolveRosterStudent(row, enrollment, offering)).toMatchObject({
      roll_number: 9,
      class_offering_id: 'off-seven-b',
      class_name: 'Seven',
      section: 'B',
    })
  })

  it('falls back to the legacy bridge columns when the Enrollment embed is empty', () => {
    expect(resolveRosterStudent(row, null, null)).toMatchObject({
      roll_number: 4,
      class_name: 'Six',
      section: 'A',
    })
  })

  it('never backs class_offering_id with the legacy bridge — a Student with no Enrollment stays unplaced for filtering', () => {
    // Same row as the fallback case above: class_name/section/roll_number show
    // something, but class_offering_id — what rosterFor actually filters on —
    // must still be null, or the Student would wrongly start matching a
    // specific class filter it was never actually enrolled in.
    expect(resolveRosterStudent(row, null, null).class_offering_id).toBeNull()
  })
})

describe('registerRows', () => {
  const roster = [
    student({ id: 'a', full_name: 'Ayesha', roll_number: 1 }),
    student({ id: 'b', full_name: 'Babul', roll_number: 2 }),
    student({ id: 'c', full_name: 'Chameli', roll_number: 3 }),
  ]

  it('absence is the absence of a record, and a cause is what marks it', () => {
    // 0046: attendance_records holds present-ish rows only. A student with a
    // cause note is absent; a student with neither is present by default.
    const rows = registerRows(roster, new Set(['a']), new Map([['b', 'sick']]))
    expect(rows.map((r) => [r.id, r.present, r.cause])).toEqual([
      ['a', true, ''],
      ['b', false, 'sick'],
      ['c', true, ''],
    ])
  })

  it('an untaken register reads as everyone present — which is why the screen must say it is untaken', () => {
    const rows = registerRows(roster, new Set(), new Map())
    expect(rows.every((r) => r.present)).toBe(true)
  })
})
