import { describe, it, expect } from 'vitest'
import {
  SIDEBAR_COOKIE,
  PREF_MAX_AGE,
  THEME_COOKIE,
  SHIFT_SELECTION_COOKIE,
  parseSidebarCollapsed,
  parseThemePreference,
  parseShiftSelection,
  sidebarCookieAssignment,
  themeCookieAssignment,
  shiftSelectionCookieAssignment,
  themeAttribute,
} from '@/lib/ui-prefs'

// Sidebar collapse is a deliberate user preference, so it persists in a cookie the
// server reads before first paint (issue #115) — same convention as `lang`.
describe('parseSidebarCollapsed (issue #115)', () => {
  it('treats "1" as collapsed', () => {
    expect(parseSidebarCollapsed('1')).toBe(true)
  })
  it('treats "0" as expanded', () => {
    expect(parseSidebarCollapsed('0')).toBe(false)
  })
  it('defaults to expanded when the cookie is missing or unrecognised', () => {
    expect(parseSidebarCollapsed(undefined)).toBe(false)
    expect(parseSidebarCollapsed('')).toBe(false)
    expect(parseSidebarCollapsed('true')).toBe(false)
  })
})

describe('sidebarCookieAssignment', () => {
  it('writes a year-long, path-wide cookie so the choice survives refresh and re-login', () => {
    expect(sidebarCookieAssignment(true)).toBe(`${SIDEBAR_COOKIE}=1;path=/;max-age=${PREF_MAX_AGE};samesite=lax`)
    expect(sidebarCookieAssignment(false)).toBe(`${SIDEBAR_COOKIE}=0;path=/;max-age=${PREF_MAX_AGE};samesite=lax`)
  })
  it('uses a max-age of one year', () => {
    expect(PREF_MAX_AGE).toBe(31536000)
  })
})

// Theme (map #370, finally implementing ADR 0005). Three states — light, dark and
// system — persisted in a cookie so the server can paint the right theme on first
// render rather than flashing the wrong one after hydration.
describe('parseThemePreference (map #370)', () => {
  it('accepts the three real preferences', () => {
    expect(parseThemePreference('light')).toBe('light')
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('system')).toBe('system')
  })

  it('defaults to following the system when missing or unrecognised', () => {
    expect(parseThemePreference(undefined)).toBe('system')
    expect(parseThemePreference('')).toBe('system')
    expect(parseThemePreference('DARK')).toBe('system')
    expect(parseThemePreference('midnight')).toBe('system')
  })
})

describe('themeCookieAssignment', () => {
  it('writes a year-long, path-wide cookie so the choice survives refresh and re-login', () => {
    expect(themeCookieAssignment('dark')).toBe(
      `${THEME_COOKIE}=dark;path=/;max-age=${PREF_MAX_AGE};samesite=lax`,
    )
    expect(themeCookieAssignment('system')).toBe(
      `${THEME_COOKIE}=system;path=/;max-age=${PREF_MAX_AGE};samesite=lax`,
    )
  })
})

// The attribute is what makes all three states flash-free without any script:
// an explicit choice stamps data-theme and wins over the media query, while
// "system" deliberately stamps nothing so prefers-color-scheme decides.
describe('themeAttribute', () => {
  it('stamps the explicit choices', () => {
    expect(themeAttribute('light')).toBe('light')
    expect(themeAttribute('dark')).toBe('dark')
  })

  it('stamps nothing for system, leaving prefers-color-scheme in charge', () => {
    expect(themeAttribute('system')).toBeUndefined()
  })
})

// Global Shift Selection (issue #577, Wave 5/#590) — every case from the
// resolution table, verified one by one rather than assumed to hold.
describe('parseShiftSelection (issue #577)', () => {
  it('falls back to every configured Shift when the cookie is missing', () => {
    expect(parseShiftSelection(undefined, ['Morning', 'Day'])).toEqual(['Morning', 'Day'])
  })

  it('falls back to every configured Shift when the cookie is empty', () => {
    expect(parseShiftSelection('', ['Morning', 'Day'])).toEqual(['Morning', 'Day'])
  })

  it('falls back to every configured Shift when the whole selection is invalid', () => {
    expect(parseShiftSelection('Evening', ['Morning', 'Day'])).toEqual(['Morning', 'Day'])
  })

  it('keeps only the still-valid values on a partially-invalid selection, without falling back', () => {
    expect(parseShiftSelection('Morning,Evening', ['Morning', 'Day'])).toEqual(['Morning'])
  })

  it('returns empty for a No-Shift institute regardless of the cookie', () => {
    expect(parseShiftSelection('Morning', [])).toEqual([])
    expect(parseShiftSelection(undefined, [])).toEqual([])
  })

  it('preserves a narrowed selection when the configuration widens', () => {
    expect(parseShiftSelection('Morning', ['Morning', 'Day', 'Evening'])).toEqual(['Morning'])
  })

  it('partially repairs a selection when the configuration narrows, without falling back', () => {
    expect(parseShiftSelection('Morning,Evening', ['Morning', 'Day'])).toEqual(['Morning'])
  })

  it('fully repairs (falls back) when narrowing invalidates the whole selection', () => {
    expect(parseShiftSelection('Morning,Evening', ['Day'])).toEqual(['Day'])
  })
})

describe('shiftSelectionCookieAssignment', () => {
  it('writes a year-long, path-wide, comma-joined cookie', () => {
    expect(shiftSelectionCookieAssignment(['Morning', 'Day'])).toBe(
      `${SHIFT_SELECTION_COOKIE}=Morning,Day;path=/;max-age=${PREF_MAX_AGE};samesite=lax`,
    )
  })

  it('writes an empty value for an empty selection', () => {
    expect(shiftSelectionCookieAssignment([])).toBe(
      `${SHIFT_SELECTION_COOKIE}=;path=/;max-age=${PREF_MAX_AGE};samesite=lax`,
    )
  })
})
