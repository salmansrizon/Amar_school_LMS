import { describe, it, expect } from 'vitest'
import { ORIGIN_PARAM, resolveBackHref, selfOrigin, withOrigin } from '@/lib/back-nav'

const FALLBACK = '/school/exams/abc'

describe('resolveBackHref', () => {
  it('returns the fallback when there is no origin', () => {
    expect(resolveBackHref(undefined, FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('', FALLBACK)).toBe(FALLBACK)
  })

  it('returns an internal school path unchanged', () => {
    expect(resolveBackHref('/school/exams', FALLBACK)).toBe('/school/exams')
    expect(resolveBackHref('/school/exams/abc/seat-plan', FALLBACK)).toBe('/school/exams/abc/seat-plan')
  })

  it('preserves the query string, which is what carries filters and the row anchor', () => {
    expect(resolveBackHref('/school/exams?q=test&status=open&exam=abc', FALLBACK)).toBe(
      '/school/exams?q=test&status=open&exam=abc',
    )
  })

  // Every case below is an open-redirect attempt: `from` is user-controllable
  // input that ends up as a link target.
  it('rejects an absolute URL to another origin', () => {
    expect(resolveBackHref('https://evil.com', FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('http://evil.com/school/exams', FALLBACK)).toBe(FALLBACK)
  })

  it('rejects a protocol-relative URL', () => {
    expect(resolveBackHref('//evil.com', FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('//evil.com/school/exams', FALLBACK)).toBe(FALLBACK)
  })

  it('rejects backslash variants that browsers normalize to protocol-relative', () => {
    expect(resolveBackHref('/\\evil.com', FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('/\\/evil.com', FALLBACK)).toBe(FALLBACK)
  })

  it('rejects traversal that escapes the school area', () => {
    expect(resolveBackHref('/school/../../etc', FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('/school/../admin', FALLBACK)).toBe(FALLBACK)
  })

  it('rejects paths outside the school area', () => {
    expect(resolveBackHref('/super-admin/schools', FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('/login', FALLBACK)).toBe(FALLBACK)
  })

  it('rejects a relative path with no leading slash', () => {
    expect(resolveBackHref('school/exams', FALLBACK)).toBe(FALLBACK)
    expect(resolveBackHref('javascript:alert(1)', FALLBACK)).toBe(FALLBACK)
  })

  it('rejects a repeated param, which arrives as an array', () => {
    expect(resolveBackHref(['/school/exams', '/school/fees'], FALLBACK)).toBe(FALLBACK)
  })

  // A stray `%` is reachable from ordinary use, not just abuse: searching the
  // exam list for "50%" produces exactly this origin. Rejecting it would strand
  // the user on Basic Info, so it is normalized into a well-formed query.
  it('normalizes a stray percent in the query rather than rejecting it', () => {
    expect(resolveBackHref('/school/exams?q=50%', FALLBACK)).toBe('/school/exams?q=50%25')
  })

  it('never escapes the school area on malformed percent-encoding', () => {
    expect(resolveBackHref('/school/%zz', FALLBACK).startsWith('/school/')).toBe(true)
    expect(resolveBackHref('/school/%', FALLBACK).startsWith('/school/')).toBe(true)
  })

  it('always returns something a browser can navigate to', () => {
    for (const candidate of ['/school/exams?q=50%', '/school/%zz', '/school/a?b=%&c=1', '/school/exams']) {
      const href = resolveBackHref(candidate, FALLBACK)
      expect(() => new URL(href, 'https://internal.invalid')).not.toThrow()
    }
  })
})

describe('withOrigin', () => {
  it('adds the origin param to a bare href', () => {
    expect(withOrigin('/school/exams/abc/routine', '/school/exams')).toBe(
      `/school/exams/abc/routine?${ORIGIN_PARAM}=%2Fschool%2Fexams`,
    )
  })

  it('appends to an href that already has a query', () => {
    expect(withOrigin('/school/exams/abc/print-all?doc=admit-card', '/school/exams')).toBe(
      `/school/exams/abc/print-all?doc=admit-card&${ORIGIN_PARAM}=%2Fschool%2Fexams`,
    )
  })

  it('round-trips through resolveBackHref, query string and all', () => {
    const origin = '/school/exams?q=mid term&status=open&exam=abc'
    const href = withOrigin('/school/exams/abc/seat-plan', origin)
    const from = new URL(href, 'https://internal.invalid').searchParams.get(ORIGIN_PARAM)
    // `+` and `%20` both decode to a space; the query is re-serialized on the way out.
    expect(resolveBackHref(from ?? undefined, FALLBACK)).toBe('/school/exams?q=mid+term&status=open&exam=abc')
  })
})

describe('selfOrigin', () => {
  it('is just the path when the page has no origin of its own', () => {
    expect(selfOrigin('/school/exams/abc/printables', undefined)).toBe('/school/exams/abc/printables')
  })

  // The case that breaks without nesting: list → Printables → Mark Sheet, then
  // Back twice, used to land on Basic Info because Printables lost the origin.
  it('carries the page own origin, so a deeper link returns through it', () => {
    const listOrigin = '/school/exams?status=open&exam=abc'
    const printables = selfOrigin('/school/exams/abc/printables', paramFor(listOrigin))

    const leaf = withOrigin('/school/exams/abc/mark-sheet/s1', printables)
    const backToPrintables = resolveBackHref(paramOf(leaf), '/fallback')
    expect(backToPrintables).toBe(`/school/exams/abc/printables?${ORIGIN_PARAM}=${encodeURIComponent(listOrigin)}`)

    // ...and the next Back reaches the exam row, not Basic Info.
    expect(resolveBackHref(paramOf(backToPrintables), '/fallback')).toBe(listOrigin)
  })

  it('drops an untrusted origin rather than nesting it', () => {
    expect(selfOrigin('/school/exams/abc/printables', 'https://evil.com')).toBe('/school/exams/abc/printables')
  })
})

/** The decoded `from` value Next hands a page for this href. */
function paramOf(href: string): string {
  return new URL(href, 'https://internal.invalid').searchParams.get(ORIGIN_PARAM) ?? ''
}

/** What Next hands a page that was opened carrying `origin`. */
function paramFor(origin: string): string {
  return paramOf(withOrigin('/x', origin))
}
