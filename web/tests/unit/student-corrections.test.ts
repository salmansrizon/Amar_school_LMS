import { describe, it, expect } from 'vitest'
import {
  rejectCorrection,
  isCorrectable,
  sortRequests,
  isPhotoRequest,
  CORRECTABLE_FIELDS,
  NEVER_CORRECTABLE,
  type CorrectionRequest,
} from '@/lib/student/corrections'

const req = (over: Partial<CorrectionRequest> & { id: string }): CorrectionRequest => ({
  field: 'student_mobile',
  current_value: '0170',
  requested_value: '0171',
  note: null,
  status: 'pending',
  reject_reason: null,
  created_at: '2026-08-01T00:00:00Z',
  resolved_at: null,
  ...over,
})

describe('isCorrectable', () => {
  it('accepts contact details', () => {
    expect(isCorrectable('student_mobile')).toBe(true)
    expect(isCorrectable('guardian_mobile')).toBe(true)
  })

  it('refuses everything admission and transfer own', () => {
    for (const field of Object.keys(NEVER_CORRECTABLE)) {
      expect(isCorrectable(field), field).toBe(false)
    }
  })

  it('never lets the two lists overlap', () => {
    for (const field of CORRECTABLE_FIELDS) {
      expect(NEVER_CORRECTABLE[field]).toBeUndefined()
    }
  })
})

describe('rejectCorrection', () => {
  it('accepts a genuine change', () => {
    expect(rejectCorrection({ field: 'student_mobile', requestedValue: '0171', currentValue: '0170' })).toBeNull()
  })

  it('refuses a field outside the whitelist', () => {
    expect(rejectCorrection({ field: 'roll_number', requestedValue: '5', currentValue: '4' })).toBe('field')
  })

  it('refuses an empty value', () => {
    expect(rejectCorrection({ field: 'student_mobile', requestedValue: '  ', currentValue: '0170' })).toBe('value')
  })

  it('refuses a request that would change nothing', () => {
    // Otherwise the Owner gets a queue item that does nothing and the Student
    // gets no explanation for why nothing happened.
    expect(rejectCorrection({ field: 'student_mobile', requestedValue: ' 0170 ', currentValue: '0170' })).toBe('unchanged')
  })

  it('treats a null current value as empty, not as a match', () => {
    expect(rejectCorrection({ field: 'blood_group', requestedValue: 'B+', currentValue: null })).toBeNull()
  })
})

describe('sortRequests', () => {
  it('puts pending first, then newest', () => {
    const sorted = sortRequests([
      req({ id: 'old-applied', status: 'applied', created_at: '2026-09-01T00:00:00Z' }),
      req({ id: 'pending-old', created_at: '2026-01-01T00:00:00Z' }),
      req({ id: 'pending-new', created_at: '2026-08-01T00:00:00Z' }),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['pending-new', 'pending-old', 'old-applied'])
  })
})

describe('isPhotoRequest', () => {
  it('flags a photo, whose value is a storage path rather than text', () => {
    expect(isPhotoRequest({ field: 'photo_path' })).toBe(true)
    expect(isPhotoRequest({ field: 'blood_group' })).toBe(false)
  })
})
