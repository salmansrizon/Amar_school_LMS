import { describe, it, expect } from 'vitest'
import {
  PRINT_THEMES,
  DEFAULT_THEME_KEY,
  resolveTheme,
  themeStyle,
  isThemeKey,
} from '@/lib/print-themes'

// Seam: the curated admit-card colour palette (issue #94, map #91,
// docs/improvement.md §1). Presets — not free colour pickers — are what
// enforce the doc's "professional and consistent appearance" clause.

describe('PRINT_THEMES', () => {
  it('offers a curated set, not an open palette', () => {
    expect(PRINT_THEMES.length).toBeGreaterThanOrEqual(5)
    expect(PRINT_THEMES.length).toBeLessThanOrEqual(8)
  })

  it('every preset names all three surfaces plus a label in both languages', () => {
    for (const theme of PRINT_THEMES) {
      expect(theme.paper).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.ink).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.label.bn).toBeTruthy()
      expect(theme.label.en).toBeTruthy()
    }
  })

  it('has a plain default that prints legibly on any printer', () => {
    const fallback = PRINT_THEMES.find((t) => t.key === DEFAULT_THEME_KEY)
    expect(fallback?.paper).toBe('#ffffff')
  })

  it('keys are unique', () => {
    const keys = PRINT_THEMES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('resolveTheme', () => {
  it('prefers the per-print override over the school default', () => {
    expect(resolveTheme('slate', 'classic').key).toBe('slate')
  })

  it('falls back to the school default when no override is given', () => {
    expect(resolveTheme(undefined, 'slate').key).toBe('slate')
    expect(resolveTheme(null, 'slate').key).toBe('slate')
  })

  it('falls back to the plain default when neither is set', () => {
    expect(resolveTheme(undefined, null).key).toBe(DEFAULT_THEME_KEY)
  })

  it('ignores an unknown key rather than printing an undefined colour', () => {
    expect(resolveTheme('rainbow', null).key).toBe(DEFAULT_THEME_KEY)
    expect(resolveTheme(undefined, 'rainbow').key).toBe(DEFAULT_THEME_KEY)
  })
})

describe('isThemeKey', () => {
  it('accepts a curated key and rejects anything else', () => {
    expect(isThemeKey(DEFAULT_THEME_KEY)).toBe(true)
    expect(isThemeKey('rainbow')).toBe(false)
    expect(isThemeKey('')).toBe(false)
  })
})

describe('themeStyle', () => {
  it('exposes the preset as the CSS custom properties the sheet reads', () => {
    const style = themeStyle(resolveTheme('slate', null))
    const slate = PRINT_THEMES.find((t) => t.key === 'slate')!
    expect(style['--print-paper']).toBe(slate.paper)
    expect(style['--print-ink']).toBe(slate.ink)
    expect(style['--print-accent']).toBe(slate.accent)
  })
})
