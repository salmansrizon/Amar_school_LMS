import { describe, expect, it } from 'vitest'
import { cspFor, cspHeaderName, isPrefetch } from '@/lib/auth/csp'

// Set at import time, not in beforeAll: a describe body runs before its hooks, so
// anything computed there would read the unset env.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co'

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `) || d === name) ?? ''

describe('cspFor', () => {
  const csp = cspFor('NONCE123')

  it('carries the nonce in script-src with strict-dynamic', () => {
    expect(directive(csp, 'script-src')).toContain("'nonce-NONCE123'")
    expect(directive(csp, 'script-src')).toContain("'strict-dynamic'")
  })

  // Trap 1 from the #543 research. A nonce cannot authorise a style="..."
  // ATTRIBUTE, and React SSR emits them — but 'unsafe-inline' must not reach
  // inline <style> ELEMENTS, which is where the real injection risk is.
  it('allows inline style ATTRIBUTES without loosening inline style ELEMENTS', () => {
    expect(directive(csp, 'style-src-attr')).toBe("style-src-attr 'unsafe-inline'")
    expect(directive(csp, 'style-src')).not.toContain('unsafe-inline')
  })

  // Trap 2. Twelve /api/* routes 302 to a signed Supabase Storage URL and CSP
  // checks the REDIRECT TARGET, so 'self' alone breaks every private image and
  // every print-view logo.
  it('allows the Supabase origin as an image source, not just a connect target', () => {
    expect(directive(csp, 'img-src')).toContain('https://abcdefgh.supabase.co')
  })

  it('allows Supabase over both https and wss for connect', () => {
    expect(directive(csp, 'connect-src')).toContain('https://abcdefgh.supabase.co')
    expect(directive(csp, 'connect-src')).toContain('wss://abcdefgh.supabase.co')
  })

  it('derives the Supabase origin instead of hardcoding it', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    const local = cspFor('N')
    expect(directive(local, 'connect-src')).toContain('ws://127.0.0.1:54321')
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co'
  })

  it('locks down the directives that do not inherit from default-src', () => {
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'none'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  it('names a reporting endpoint, or report-to is inert', () => {
    expect(csp).toContain('report-to csp-endpoint')
  })
})

describe('cspHeaderName', () => {
  it('reports rather than enforces unless explicitly told otherwise', () => {
    delete process.env.CSP_MODE
    expect(cspHeaderName()).toBe('Content-Security-Policy-Report-Only')
    process.env.CSP_MODE = 'report'
    expect(cspHeaderName()).toBe('Content-Security-Policy-Report-Only')
  })

  it('enforces on one env var, so rollback is an env edit not a revert', () => {
    process.env.CSP_MODE = 'enforce'
    expect(cspHeaderName()).toBe('Content-Security-Policy')
    delete process.env.CSP_MODE
  })
})

describe('isPrefetch', () => {
  // A nonce baked into a cached prefetch payload will not match the document that
  // later renders it.
  it('recognises both prefetch signals', () => {
    expect(isPrefetch(new Headers({ 'next-router-prefetch': '1' }))).toBe(true)
    expect(isPrefetch(new Headers({ purpose: 'prefetch' }))).toBe(true)
    expect(isPrefetch(new Headers())).toBe(false)
  })
})
