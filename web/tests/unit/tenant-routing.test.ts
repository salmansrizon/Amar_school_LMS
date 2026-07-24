import { describe, expect, it } from 'vitest'
import { tenantRoute, type TenantFacts } from '@/lib/auth/tenant-routing'

const owner = (schoolId: string, ownSubdomain: string | null) =>
  ({ role: 'school_owner' as const, schoolId, ownSubdomain })

describe('tenantRoute — tenant subdomain', () => {
  it('unknown subdomain → no such school', () => {
    const f: TenantFacts = {
      host: { kind: 'tenant', slug: 'ghost' },
      path: '/login',
      session: null,
      schoolForHostId: null,
    }
    expect(tenantRoute(f)).toEqual({ type: 'no-such-school' })
  })

  it('anonymous visitor on a real subdomain → served', () => {
    const f: TenantFacts = {
      host: { kind: 'tenant', slug: 'greenwood' },
      path: '/login',
      session: null,
      schoolForHostId: 'school-1',
    }
    expect(tenantRoute(f)).toEqual({ type: 'next' })
  })

  it('own member stays', () => {
    const f: TenantFacts = {
      host: { kind: 'tenant', slug: 'greenwood' },
      path: '/school',
      session: owner('school-1', 'greenwood'),
      schoolForHostId: 'school-1',
    }
    expect(tenantRoute(f)).toEqual({ type: 'next' })
  })

  it('member of another school → bounced to own subdomain, same path', () => {
    const f: TenantFacts = {
      host: { kind: 'tenant', slug: 'greenwood' },
      path: '/school/students',
      session: owner('school-2', 'riverside'),
      schoolForHostId: 'school-1',
    }
    expect(tenantRoute(f)).toEqual({ type: 'redirect-subdomain', slug: 'riverside', path: '/school/students' })
  })
})

describe('tenantRoute — apex', () => {
  it('apex /school with a signed-in member → own subdomain', () => {
    const f: TenantFacts = {
      host: { kind: 'apex' },
      path: '/school',
      session: owner('school-1', 'greenwood'),
      schoolForHostId: null,
    }
    expect(tenantRoute(f)).toEqual({ type: 'redirect-subdomain', slug: 'greenwood', path: '/school' })
  })

  it('apex super-admin path → served (vendor role, no subdomain)', () => {
    const f: TenantFacts = {
      host: { kind: 'apex' },
      path: '/super-admin',
      session: { role: 'super_admin', schoolId: null, ownSubdomain: null },
      schoolForHostId: null,
    }
    expect(tenantRoute(f)).toEqual({ type: 'next' })
  })

  it('apex marketing/login → served', () => {
    const f: TenantFacts = {
      host: { kind: 'apex' },
      path: '/login',
      session: null,
      schoolForHostId: null,
    }
    expect(tenantRoute(f)).toEqual({ type: 'next' })
  })
})
