import { describe, expect, it } from 'vitest'
import { genderLabel, guardianRelationLabel, storedFieldLabel } from '@/lib/students/stored-labels'

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

// Review of #539 found two more leaks the first pass missed: `gender` was still an
// inline ternary on the owner's detail page and raw on the printed admission form
// — the same defect on the same document — and the corrections queue rendered any
// field's value raw, so a guardian_relation request read `father` mid-Bangla.
describe('genderLabel', () => {
  it('translates the vocabulary, case-insensitively', () => {
    expect(genderLabel('male', 'bn')).toBe('পুরুষ')
    expect(genderLabel('Female', 'bn')).toBe('মহিলা')
    expect(genderLabel('male', 'en')).toBe('Male')
  })
})

describe('storedFieldLabel', () => {
  it('dispatches by field name, for surfaces that render arbitrary fields', () => {
    expect(storedFieldLabel('guardian_relation', 'father', 'bn')).toBe('পিতা')
    expect(storedFieldLabel('gender', 'female', 'bn')).toBe('মহিলা')
  })

  it('leaves a field with no vocabulary exactly as stored', () => {
    expect(storedFieldLabel('guardian_name', 'father', 'bn')).toBe('father')
    expect(storedFieldLabel('village', 'Mirpur', 'bn')).toBe('Mirpur')
  })
})
