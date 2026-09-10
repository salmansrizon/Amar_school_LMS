import { describe, it, expect } from 'vitest'
import {
  SIDEBAR_COOKIE,
  PREF_MAX_AGE,
  THEME_COOKIE,
  SHIFT_SELECTION_COOKIE,
  ACADEMIC_YEAR_SELECTION_COOKIE,
  parseSidebarCollapsed,
  parseThemePreference,
  parseShiftSelection,
  parseAcademicYearSelection,
  toggleAcademicYearSelection,
  academicYearSectionVisible,
  sidebarCookieAssignment,
  themeCookieAssignment,
  shiftSelectionCookieAssignment,
  academicYearSelectionCookieAssignment,
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

// Global Academic Year Selection (map #609, ticket #612) — a per-user cookie
// view preference over the School's *started* Academic Years. The invariant the
// whole feature leans on: the current year is always in the effective
// selection, whatever the cookie says. Every row of the ticket's table checked
// one by one.
describe('parseAcademicYearSelection (map #609)', () => {
  const started = [2027, 2026, 2025] // newest first, as school_academic_years is read

  it('falls back to every started year when the cookie is missing', () => {
    expect(parseAcademicYearSelection(undefined, started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('falls back to every started year when the cookie is empty', () => {
    expect(parseAcademicYearSelection('', started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('falls back to every started year when every requested year is unknown', () => {
    expect(parseAcademicYearSelection('1999,2099', started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('drops a requested year that is not a started year', () => {
    expect(parseAcademicYearSelection('2026,2020', started, 2027)).toEqual([2027, 2026])
  })

  it('lets older started years toggle in and out as requested', () => {
    expect(parseAcademicYearSelection('2026', started, 2027)).toEqual([2027, 2026])
    expect(parseAcademicYearSelection('2025,2026', started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('always includes the active year even when the cookie omits it', () => {
    expect(parseAcademicYearSelection('2025', started, 2027)).toEqual([2027, 2025])
    expect(parseAcademicYearSelection('2026,2025', started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('never omits the active year on a fallback-to-all either', () => {
    // active year not (yet) in the started-years list — still forced in
    expect(parseAcademicYearSelection(undefined, [2026, 2025], 2027)).toEqual([2027, 2026, 2025])
  })

  it('sorts the result newest first regardless of cookie order', () => {
    expect(parseAcademicYearSelection('2025,2027,2026', started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('deduplicates a repeated year in the cookie', () => {
    expect(parseAcademicYearSelection('2026,2026', started, 2027)).toEqual([2027, 2026])
  })

  it('ignores non-numeric cookie noise', () => {
    expect(parseAcademicYearSelection('2026,abc,,2025', started, 2027)).toEqual([2027, 2026, 2025])
  })

  it('with a null active year, returns the requested started years (may be empty)', () => {
    expect(parseAcademicYearSelection('2026', started, null)).toEqual([2026])
    expect(parseAcademicYearSelection('1999', started, null)).toEqual([2027, 2026, 2025])
    expect(parseAcademicYearSelection('2026', [], null)).toEqual([])
  })
})

describe('academicYearSelectionCookieAssignment', () => {
  it('writes a year-long, path-wide, comma-joined cookie', () => {
    expect(academicYearSelectionCookieAssignment([2027, 2026])).toBe(
      `${ACADEMIC_YEAR_SELECTION_COOKIE}=2027,2026;path=/;max-age=${PREF_MAX_AGE};samesite=lax`,
    )
  })

  it('writes an empty value for an empty selection', () => {
    expect(academicYearSelectionCookieAssignment([])).toBe(
      `${ACADEMIC_YEAR_SELECTION_COOKIE}=;path=/;max-age=${PREF_MAX_AGE};samesite=lax`,
    )
  })
})

// The context popover's toggle handler (ticket #613). The invariant that has to
// hold here — same as parseAcademicYearSelection, but client-side — is that the
// active year can never leave the selection.
describe('toggleAcademicYearSelection (ticket #613)', () => {
  it('adds an older year that was not selected', () => {
    expect(toggleAcademicYearSelection([2027, 2026], 2025, 2027)).toEqual([2027, 2026, 2025])
  })

  it('removes an older year that was selected', () => {
    expect(toggleAcademicYearSelection([2027, 2026, 2025], 2026, 2027)).toEqual([2027, 2025])
  })

  it('is a no-op when the toggled year is the active year (never deselectable)', () => {
    expect(toggleAcademicYearSelection([2027, 2026], 2027, 2027)).toEqual([2027, 2026])
  })

  it('does not re-add the active year on toggle even if the selection somehow lacks it', () => {
    expect(toggleAcademicYearSelection([2026], 2027, 2027)).toEqual([2026])
  })

  it('sorts the result newest first regardless of insertion order', () => {
    expect(toggleAcademicYearSelection([2025, 2027], 2026, 2027)).toEqual([2027, 2026, 2025])
  })

  it('de-dupes if the same year is somehow already present', () => {
    expect(toggleAcademicYearSelection([2027, 2026, 2026], 2025, 2027)).toEqual([2027, 2026, 2025])
  })

  it('toggles freely when there is no active year', () => {
    expect(toggleAcademicYearSelection([2026], 2025, null)).toEqual([2026, 2025])
    expect(toggleAcademicYearSelection([2026, 2025], 2025, null)).toEqual([2026])
  })
})

describe('academicYearSectionVisible (ticket #613)', () => {
  it('is hidden for a School with no started years', () => {
    expect(academicYearSectionVisible([])).toBe(false)
  })

  it('is hidden for a School that has started exactly one year', () => {
    expect(academicYearSectionVisible([2027])).toBe(false)
  })

  it('is shown once a School has started a second year', () => {
    expect(academicYearSectionVisible([2027, 2026])).toBe(true)
  })
})
