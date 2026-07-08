/**
 * PDF-side design tokens, mirrored from the Family design system
 * (app/globals.css `@theme`, ADR 0006). react-pdf's StyleSheet cannot read the
 * Tailwind/CSS custom properties, so the printable surface keeps its own small
 * copy of the tokens it needs — kept in sync with globals.css by hand.
 */
export const pdfTokens = {
  ink: '#131313',
  inkSoft: '#3a3a3a',
  muted: '#767676',
  paper: '#ffffff',
  paperMuted: '#f5f4f1',
  line: '#ececec',
  lineStrong: '#d8d8d8',
  brand: '#2f7eff',
  brandInk: '#1a58c8',
  mintDeep: '#0a7a48',
  alertDeep: '#dc2626',
} as const

export const pdfSpace = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
} as const
