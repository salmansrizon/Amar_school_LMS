import type { CSSProperties } from 'react'

// Curated print colour presets (issue #94, map #91, docs/improvement.md §1).
//
// The doc asks for paper/font/theme colour customization "while preserving a
// professional and consistent appearance". Free colour pickers cannot promise
// that — a school picks yellow-on-white and the admit card is unreadable, or
// picks a dark paper and burns a cartridge per class. So the affordance is a
// short list of vetted combinations: each one is a light paper with a dark ink
// well past legibility contrast, plus one accent for rules and the doc title.
//
// Scope is deliberately admit-card-only (map #91 fog-grilling, 2026-07-23):
// mark sheets, result books and transcripts stay monochrome. The *storage* is
// keyed by document type all the same, so extending to another printable later
// is inserting a row, not rewriting a schema.

export interface PrintTheme {
  key: string
  label: { bn: string; en: string }
  /** Sheet background. */
  paper: string
  /** Body text. */
  ink: string
  /** Rules, borders and the document title. */
  accent: string
}

export const PRINT_THEMES: PrintTheme[] = [
  {
    key: 'classic',
    label: { bn: 'ক্লাসিক সাদা', en: 'Classic White' },
    paper: '#ffffff',
    ink: '#1a1a1a',
    accent: '#1a1a1a',
  },
  {
    key: 'slate',
    label: { bn: 'স্লেট নীল', en: 'Slate Blue' },
    paper: '#f4f7fb',
    ink: '#16233a',
    accent: '#1f4e8c',
  },
  {
    key: 'sage',
    label: { bn: 'সবুজাভ', en: 'Sage Green' },
    paper: '#f3f8f3',
    ink: '#17301f',
    accent: '#2c6b45',
  },
  {
    key: 'sand',
    label: { bn: 'বালুরঙ', en: 'Sand' },
    paper: '#fbf6ec',
    ink: '#2f2718',
    accent: '#8a6224',
  },
  {
    key: 'maroon',
    label: { bn: 'মেরুন', en: 'Maroon' },
    paper: '#fdf4f4',
    ink: '#2b1416',
    accent: '#8c2230',
  },
  {
    key: 'ink',
    label: { bn: 'গাঢ় কালি', en: 'Deep Ink' },
    paper: '#f6f6f8',
    ink: '#14141c',
    accent: '#3b3b5c',
  },
]

/** Plain white — what a school gets until it chooses, and the safe fallback
 *  for any key we do not recognise. */
export const DEFAULT_THEME_KEY = 'classic'

const BY_KEY = new Map(PRINT_THEMES.map((t) => [t.key, t]))

export function isThemeKey(key: string): boolean {
  return BY_KEY.has(key)
}

/** Per-print override (URL param) beats the school's saved default, which
 *  beats plain white. An unknown key at either level is ignored rather than
 *  printing an undefined colour. */
export function resolveTheme(
  override: string | null | undefined,
  schoolDefault: string | null | undefined,
): PrintTheme {
  return (
    (override ? BY_KEY.get(override) : undefined) ??
    (schoolDefault ? BY_KEY.get(schoolDefault) : undefined) ??
    BY_KEY.get(DEFAULT_THEME_KEY)!
  )
}

/** The custom properties a themed sheet reads. Inline, because the values are
 *  data — Tailwind cannot generate a class per school. */
export function themeStyle(theme: PrintTheme): CSSProperties & Record<string, string> {
  return {
    '--print-paper': theme.paper,
    '--print-ink': theme.ink,
    '--print-accent': theme.accent,
  }
}

/** Document types a theme can be saved against (issue #94's storage shape).
 *  Only admit cards are themed today. */
export const THEMED_DOC_TYPES = ['admit-card'] as const
export type ThemedDocType = (typeof THEMED_DOC_TYPES)[number]
