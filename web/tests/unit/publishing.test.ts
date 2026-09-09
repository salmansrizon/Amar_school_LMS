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

describe('targetAudienceLabel: "Target Audience" column, three scopes (map #598 Wave 6)', () => {
  it('is "All Students" for scope=all', () => {
    expect(
      targetAudienceLabel(
        { target_scope: 'all', target_type: 'all', target_class_name: null, target_section: null },
        'en',
      ),
    ).toBe('All Students')
    expect(
      targetAudienceLabel(
        { target_scope: 'all', target_type: 'all', target_class_name: null, target_section: null },
        'bn',
      ),
    ).toBe('সকল শিক্ষার্থী')
  })

  it('is the Class Catalogue label for scope=offering, given the resolved Offering', () => {
    expect(
      targetAudienceLabel(
        { target_scope: 'offering', target_type: 'specific', target_class_name: null, target_section: null },
        'en',
        { name: 'Nine', section: 'A', group_department: 'Science', shift: 'Day' },
      ),
    ).toBe('Nine (Science) - Day - A')
  })

  it('says the Offering was removed when scope=offering but no Offering resolves (ON DELETE SET NULL, #599)', () => {
    expect(
      targetAudienceLabel(
        { target_scope: 'offering', target_type: 'specific', target_class_name: null, target_section: null },
        'en',
        null,
      ),
    ).toBe('Removed class offering')
  })

  it('joins Class + every non-Any dimension for scope=broadcast (Year implicit)', () => {
    expect(
      targetAudienceLabel(
        {
          target_scope: 'broadcast',
          target_type: 'specific',
          target_class_name: 'Nine',
          target_academic_year: 2026,
          target_shift: 'Day',
          target_group_department: null,
          target_section: 'A',
        },
        'en',
      ),
    ).toBe('Nine / Day / A')
  })

  it('is just the Class name for a broadcast with every dimension Any', () => {
    expect(
      targetAudienceLabel(
        {
          target_scope: 'broadcast',
          target_type: 'specific',
          target_class_name: 'Nine',
          target_academic_year: 2026,
          target_shift: null,
          target_group_department: null,
          target_section: null,
        },
        'en',
      ),
    ).toBe('Nine')
  })

  // A not-yet-backfilled legacy row (target_scope null) keeps the old
  // class / section join until Wave 7 (#608). OfficeTime left targeting with #100.
  it('falls back to the class / section join for a legacy row (no target_scope)', () => {
    expect(
      targetAudienceLabel(
        { target_type: 'specific', target_class_name: 'Class 6', target_section: 'A' },
        'en',
      ),
    ).toBe('Class 6 / A')
    expect(
      targetAudienceLabel(
        { target_type: 'all', target_class_name: null, target_section: null },
        'en',
      ),
    ).toBe('All Students')
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

describe('validateTargetSelection: three-scope compose rules (map #598 Wave 6)', () => {
  const base = {
    classOfferingId: '',
    className: '',
    academicYear: 2026 as number | null,
    shift: '',
    groupDepartment: '',
    section: '',
  }

  it('accepts scope=all with nothing selected', () => {
    expect(validateTargetSelection({ ...base, scope: 'all' })).toBeNull()
  })

  it('rejects scope=offering with no Offering picked', () => {
    expect(validateTargetSelection({ ...base, scope: 'offering' })).toBe('offering-required')
  })

  it('accepts scope=offering once an Offering is picked', () => {
    expect(
      validateTargetSelection({ ...base, scope: 'offering', classOfferingId: 'off-1' }),
    ).toBeNull()
  })

  it('rejects scope=broadcast with no Class picked', () => {
    expect(validateTargetSelection({ ...base, scope: 'broadcast' })).toBe('class-required')
  })

  it('rejects scope=broadcast when the School has no active Academic Year to pin to', () => {
    expect(
      validateTargetSelection({ ...base, scope: 'broadcast', className: 'Nine', academicYear: null }),
    ).toBe('active-year-required')
  })

  it('accepts scope=broadcast with just a Class (Shift/Group/Section stay Any)', () => {
    expect(
      validateTargetSelection({ ...base, scope: 'broadcast', className: 'Nine' }),
    ).toBeNull()
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
