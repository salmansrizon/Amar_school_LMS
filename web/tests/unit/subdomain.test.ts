import { describe, expect, it } from 'vitest'
import {
  RESERVED_SLUGS,
  isValidSlug,
  normalizeSlug,
  validateSlug,
} from '@/lib/subdomain'

describe('validateSlug', () => {
  it('accepts a plain slug', () => {
    expect(validateSlug('greenwood')).toBeNull()
    expect(validateSlug('green-wood-2')).toBeNull()
    expect(validateSlug('abc')).toBeNull()
    expect(validateSlug('a'.repeat(63))).toBeNull()
  })

  it('rejects empty / too short / too long', () => {
    expect(validateSlug('')).toBe('empty')
    expect(validateSlug('ab')).toBe('too_short')
    expect(validateSlug('a'.repeat(64))).toBe('too_long')
  })

  it('rejects illegal characters', () => {
    expect(validateSlug('Green_Wood')).toBe('charset') // underscore
    expect(validateSlug('gréén')).toBe('charset')
    expect(validateSlug('green wood')).toBe('charset')
    expect(validateSlug('green.wood')).toBe('charset')
  })

  it('rejects leading/trailing/double hyphen', () => {
    expect(validateSlug('-green')).toBe('hyphen')
    expect(validateSlug('green-')).toBe('hyphen')
    expect(validateSlug('green--wood')).toBe('hyphen')
  })

  it('rejects reserved infra + route words', () => {
    for (const w of ['www', 'app', 'api', 'admin', 'school', 'super-admin', 'login', 'reset-password']) {
      expect(validateSlug(w)).toBe('reserved')
    }
  })

  it('is case-insensitive', () => {
    expect(validateSlug('GREENWOOD')).toBeNull()
    expect(validateSlug('WWW')).toBe('reserved')
  })
})

describe('reserved set', () => {
  it('covers every documented route segment', () => {
    for (const r of ['api', 'auth', 'dealer', 'gov', 'login', 'reset-password', 'school', 'signup', 'super-admin']) {
      expect(RESERVED_SLUGS).toContain(r)
    }
  })
  it('is deduped', () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length)
  })
})

describe('normalizeSlug / isValidSlug', () => {
  it('normalizes case + trims', () => {
    expect(normalizeSlug('  GreenWood ')).toBe('greenwood')
  })
  it('isValidSlug mirrors validateSlug', () => {
    expect(isValidSlug('greenwood')).toBe(true)
    expect(isValidSlug('www')).toBe(false)
  })
})
