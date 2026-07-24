// Pure branding types + helpers for the branded login (issue #110). Kept free
// of server imports so components and tests can use it anywhere; the Host →
// school resolution lives in school-branding-server.ts.

export interface SchoolBrand {
  name: string
  logoUrl: string | null
}

/** First glyph of the school name — the logo fallback when none is set. */
export function brandInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '#'
}
