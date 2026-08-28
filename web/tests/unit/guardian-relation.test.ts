import { describe, expect, it } from 'vitest'
import { guardianRelationLabel } from '@/lib/students/guardian-relation'

// #539: a Bangla student profile showed `father` while every surrounding label was
// Bangla, and the printed admission form did the same onto an official document.
describe('guardianRelationLabel', () => {
  it('translates the vocabulary the admission form writes', () => {
    expect(guardianRelationLabel('father', 'bn')).toBe('পিতা')
    expect(guardianRelationLabel('mother', 'bn')).toBe('মাতা')
    expect(guardianRelationLabel('other', 'bn')).toBe('অন্যান্য')
    expect(guardianRelationLabel('father', 'en')).toBe('Father')
  })

  // The column is free text, not a database enum, and staging holds both spellings.
  it('is case- and whitespace-insensitive, because the column is free text', () => {
    expect(guardianRelationLabel('Father', 'bn')).toBe('পিতা')
    expect(guardianRelationLabel('  MOTHER  ', 'bn')).toBe('মাতা')
  })

  it('passes an unrecognised value through rather than blanking or guessing it', () => {
    expect(guardianRelationLabel('চাচা', 'bn')).toBe('চাচা')
    expect(guardianRelationLabel('uncle', 'en')).toBe('uncle')
  })

  it('is null for an empty value, so the row renders as absent not as a label', () => {
    expect(guardianRelationLabel(null, 'bn')).toBeNull()
    expect(guardianRelationLabel('', 'bn')).toBeNull()
  })
})
