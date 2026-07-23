import { describe, it, expect } from 'vitest'
import {
  PUBLICATION_KINDS,
  IMPORTANCE_LEVELS,
  importanceBadgeClass,
  kindBadgeClass,
  targetAudienceLabel,
  filterPublications,
  validateTargetSelection,
  albumCountLabel,
  albumIsFull,
  photoExceedsCap,
  type PublicationRow,
} from '@/lib/publishing'

describe('PUBLICATION_KINDS / IMPORTANCE_LEVELS: shared list/detail vocabulary (issue #37)', () => {
  it('covers notice, homework, lesson plan, daily lesson, exam prep', () => {
    expect(PUBLICATION_KINDS.map((k) => k.key)).toEqual([
      'notice',
      'homework',
      'lesson_plan',
      'daily_lesson',
      'exam_prep',
    ])
  })

  it('covers normal, important, urgent', () => {
    expect(IMPORTANCE_LEVELS.map((i) => i.key)).toEqual(['normal', 'important', 'urgent'])
  })
})

describe('importanceBadgeClass / kindBadgeClass: mockup badge colors', () => {
  it('urgent is the danger tone, important is warning, normal is neutral', () => {
    expect(importanceBadgeClass('urgent')).toContain('alert')
    expect(importanceBadgeClass('important')).toContain('sun')
    expect(importanceBadgeClass('normal')).toContain('muted')
  })

  it('notice is the info tone; other kinds are neutral', () => {
    expect(kindBadgeClass('notice')).toContain('sky')
    expect(kindBadgeClass('homework')).toContain('muted')
    expect(kindBadgeClass('exam_prep')).toContain('muted')
  })
})

describe('targetAudienceLabel: mockup "Target Audience" column', () => {
  it('is "All Students" for target_type all', () => {
    expect(
      targetAudienceLabel(
        { target_type: 'all', target_class_name: null, target_section: null },
        'en',
      ),
    ).toBe('All Students')
    expect(
      targetAudienceLabel(
        { target_type: 'all', target_class_name: null, target_section: null },
        'bn',
      ),
    ).toBe('সকল শিক্ষার্থী')
  })

  // Shift left publication targeting with issue #100.
  it('joins class / section for a specific target', () => {
    expect(
      targetAudienceLabel(
        { target_type: 'specific', target_class_name: 'Class 6', target_section: 'A' },
        'en',
      ),
    ).toBe('Class 6 / A')
  })

  it('drops missing parts of a specific target', () => {
    expect(
      targetAudienceLabel(
        { target_type: 'specific', target_class_name: 'Class 9', target_section: null },
        'en',
      ),
    ).toBe('Class 9')
  })
})

describe('filterPublications: list search + type filter', () => {
  const rows: PublicationRow[] = [
    { id: '1', kind: 'notice', title: 'Annual Sports Competition', importance: 'urgent' },
    { id: '2', kind: 'homework', title: 'Math — Chapter 5 Homework', importance: 'important' },
    { id: '3', kind: 'exam_prep', title: 'Annual Exam Prep Suggestions', importance: 'normal' },
  ] as PublicationRow[]

  it('matches title case-insensitively', () => {
    expect(filterPublications(rows, 'annual', '').map((r) => r.id)).toEqual(['1', '3'])
  })

  it('filters by kind', () => {
    expect(filterPublications(rows, '', 'homework').map((r) => r.id)).toEqual(['2'])
  })

  it('empty query and kind returns everything', () => {
    expect(filterPublications(rows, '', '')).toHaveLength(3)
  })
})

describe('validateTargetSelection: specific target needs at least one filter', () => {
  it('accepts "all" with nothing selected', () => {
    expect(validateTargetSelection('all', '', '')).toBeNull()
  })

  it('rejects "specific" with nothing selected', () => {
    expect(validateTargetSelection('specific', '', '')).not.toBeNull()
  })

  it('accepts "specific" with just a class chosen', () => {
    expect(validateTargetSelection('specific', 'Class 6', '')).toBeNull()
  })
})

describe('gallery album cap helpers (server-enforced, PRD §5.8/§7)', () => {
  it('albumCountLabel renders "12/20 photos"', () => {
    expect(albumCountLabel(12, 20)).toBe('12/20')
  })

  it('albumIsFull is true once count reaches the cap', () => {
    expect(albumIsFull(20, 20)).toBe(true)
    expect(albumIsFull(19, 20)).toBe(false)
  })

  it('photoExceedsCap compares bytes against the album max', () => {
    expect(photoExceedsCap(1_048_577, 1_048_576)).toBe(true)
    expect(photoExceedsCap(1_048_576, 1_048_576)).toBe(false)
  })
})
