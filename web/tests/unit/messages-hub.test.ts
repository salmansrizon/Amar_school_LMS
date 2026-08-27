import { describe, it, expect } from 'vitest'
import {
  waitingHours,
  waitingTone,
  badgeCount,
  HUB_TABS,
  HUB_HOME,
  WAITING_WARN_HOURS,
  WAITING_LATE_HOURS,
} from '@/lib/student/hub'
import { SCHOOL_SEARCH } from '@/lib/school-search'

// বার্তা ও অনুরোধ (#509, #510) — the arithmetic of the merged section.

const NOW = new Date('2026-08-27T12:00:00Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString()

describe('waitingHours', () => {
  it('measures to now while a question is still waiting', () => {
    expect(waitingHours({ created_at: hoursAgo(30) }, NOW)).toBe(30)
  })

  it('stops at the reply once one exists', () => {
    // Otherwise a question answered promptly in March would read as five months
    // late every time anybody opened the page.
    expect(
      waitingHours({ created_at: hoursAgo(100), replied_at: hoursAgo(98) }, NOW),
    ).toBe(2)
  })

  it('never goes negative on a clock skew', () => {
    expect(waitingHours({ created_at: hoursAgo(-3) }, NOW)).toBe(0)
  })
})

describe('waitingTone', () => {
  it('gives a fresh question no rail at all', () => {
    // A rail on everything is a rail on nothing.
    expect(waitingTone({ created_at: hoursAgo(2) }, NOW)).toBeUndefined()
  })

  it('warns once a question has waited past the warn threshold', () => {
    expect(waitingTone({ created_at: hoursAgo(WAITING_WARN_HOURS) }, NOW)).toBe('sun')
    expect(waitingTone({ created_at: hoursAgo(WAITING_WARN_HOURS - 1) }, NOW)).toBeUndefined()
  })

  it('escalates past the late threshold', () => {
    expect(waitingTone({ created_at: hoursAgo(WAITING_LATE_HOURS) }, NOW)).toBe('alert')
    expect(waitingTone({ created_at: hoursAgo(WAITING_LATE_HOURS + 100) }, NOW)).toBe('alert')
  })

  it('settles to mint once answered, however long it took', () => {
    // Ageing is counted on UNANSWERED items only — colouring history red shouts
    // at a teacher who has already dealt with it.
    expect(
      waitingTone({ created_at: hoursAgo(500), replied_at: hoursAgo(1), status: 'answered' }, NOW),
    ).toBe('mint')
  })

  it('settles a resolved correction request the same way', () => {
    expect(
      waitingTone({ created_at: hoursAgo(500), replied_at: hoursAgo(2), status: 'applied' }, NOW),
    ).toBe('mint')
  })

  it('keeps the thresholds named, not written into a comparison', () => {
    // 24/72 is a guess at these schools' rhythm; a school that checks twice a
    // week wants 72/168, and that has to be one edit.
    expect(WAITING_WARN_HOURS).toBeLessThan(WAITING_LATE_HOURS)
  })
})

describe('badgeCount', () => {
  it('hides a zero rather than rendering it', () => {
    // A permanent zero trains people to ignore the badge.
    expect(badgeCount(0)).toBeNull()
    expect(badgeCount(null)).toBeNull()
    expect(badgeCount(undefined)).toBeNull()
  })

  it('shows a real backlog', () => {
    expect(badgeCount(3)).toBe(3)
  })
})

describe('the section itself', () => {
  it('puts the queues first and the retrospective view last', () => {
    expect(HUB_TABS.map((t) => t.key)).toEqual(['questions', 'corrections', 'response'])
  })

  it('counts only the two queues', () => {
    // Nothing on the response report is waiting on anybody.
    expect(HUB_TABS.filter((t) => t.countable).map((t) => t.key)).toEqual([
      'questions',
      'corrections',
    ])
  })

  it('keeps every route exactly where it was', () => {
    // Consolidating under one path segment was rejected: proxy.ts gates on the
    // first segment only, so it would have cost a per-request query in edge
    // middleware to buy a cosmetic URL.
    expect(HUB_TABS.map((t) => t.href)).toEqual([
      '/school/questions',
      '/school/corrections',
      '/school/questions/response',
    ])
    expect(HUB_HOME).toBe('/school/questions')
  })
})

describe('search entries (#510)', () => {
  const hub = SCHOOL_SEARCH.filter((e) => HUB_TABS.some((t) => t.href === e.href))

  it('gives each tab its own entry', () => {
    // Three rather than one: the tabs are genuinely different destinations, and
    // someone typing সংশোধন should land on corrections, not on questions.
    expect(hub).toHaveLength(3)
  })

  it('gates them on the always-available sentinel, matching the hub riding no screen key', () => {
    expect(hub.every((e) => e.screen === 'dashboard')).toBe(true)
  })

  it('carries keywords in both languages, per the file convention', () => {
    for (const entry of hub) {
      expect(entry.keywords.some((k) => /[ঀ-৿]/.test(k))).toBe(true)
      expect(entry.keywords.some((k) => /^[a-z ]+$/.test(k))).toBe(true)
    }
  })

  it('leaves no guardian-feedback shortcut behind', () => {
    // Worse than leaving the nav item: whoever found the feature that way would
    // have no way to know it is meant to be gone (#510).
    expect(SCHOOL_SEARCH.some((e) => e.href === '/school/feedback')).toBe(false)
  })
})
