import { describe, expect, it } from 'vitest'
import { CONCEPT_ICON, isConcept } from '@/lib/ui/concept-icons'
import { pickPulse } from '@/lib/ui/pulse'
import { SCREENS } from '@/lib/auth/screens'
import { STUDENT_NAV_GROUPS } from '@/lib/student-nav'

describe('concept icons', () => {
  it('covers every screen', () => {
    for (const s of SCREENS) expect(isConcept(s.key), s.key).toBe(true)
  })
  it('covers every student nav item', () => {
    for (const g of STUDENT_NAV_GROUPS) for (const it of g.items) expect(isConcept(it.key), it.key).toBe(true)
  })
  it('never gives two concepts the same glyph', () => {
    const icons = Object.values(CONCEPT_ICON)
    expect(new Set(icons).size).toBe(icons.length)
  })
})

describe('pickPulse', () => {
  it('returns null when nothing is active, including zero counts', () => {
    expect(pickPulse([{ key: 'a', urgency: 5, active: 0 }, { key: 'b', urgency: 1, active: false }])).toBeNull()
    expect(pickPulse([])).toBeNull()
  })
  it('picks the most urgent active candidate, earlier wins ties', () => {
    expect(
      pickPulse([
        { key: 'a', urgency: 1, active: 3 },
        { key: 'b', urgency: 9, active: true },
        { key: 'c', urgency: 9, active: 2 },
      ]),
    ).toBe('b')
  })
})
