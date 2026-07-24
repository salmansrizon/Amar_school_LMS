import { describe, expect, it } from 'vitest'
import { resolveHost } from '@/lib/auth/tenant-host'

describe('resolveHost — prod root domain', () => {
  const root = 'eduwave.com'
  it('apex for bare + www', () => {
    expect(resolveHost('eduwave.com', root)).toEqual({ kind: 'apex' })
    expect(resolveHost('www.eduwave.com', root)).toEqual({ kind: 'apex' })
  })
  it('tenant for a single-label subdomain', () => {
    expect(resolveHost('greenwood.eduwave.com', root)).toEqual({ kind: 'tenant', slug: 'greenwood' })
  })
  it('strips port + lowercases', () => {
    expect(resolveHost('GreenWood.eduwave.com:443', root)).toEqual({ kind: 'tenant', slug: 'greenwood' })
  })
  it('vercel preview hosts are apex', () => {
    expect(resolveHost('my-app-abc.vercel.app', root)).toEqual({ kind: 'apex' })
  })
  it('deeper nesting falls back to apex', () => {
    expect(resolveHost('a.b.eduwave.com', root)).toEqual({ kind: 'apex' })
  })
  it('foreign host is apex', () => {
    expect(resolveHost('example.org', root)).toEqual({ kind: 'apex' })
  })
  it('missing host is apex', () => {
    expect(resolveHost(null, root)).toEqual({ kind: 'apex' })
  })
})

describe('resolveHost — local dev', () => {
  const root = 'localhost:3000'
  it('apex for localhost', () => {
    expect(resolveHost('localhost:3000', root)).toEqual({ kind: 'apex' })
  })
  it('tenant for slug.localhost', () => {
    expect(resolveHost('greenwood.localhost:3000', root)).toEqual({ kind: 'tenant', slug: 'greenwood' })
  })
})
