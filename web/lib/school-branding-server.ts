import { createClient } from '@/lib/supabase/server'
import { resolveHost, rootDomain } from '@/lib/auth/tenant-host'
import type { SchoolBrand } from '@/lib/school-branding'

// Resolve a request Host into a school's public branding (issue #110). Anon-safe:
// reads via the security-definer school_by_subdomain RPC and signs the logo from
// the (anon-readable) school-logos bucket.

export async function brandForHost(host: string | null): Promise<SchoolBrand | null> {
  const resolution = resolveHost(host, rootDomain())
  if (resolution.kind !== 'tenant') return null

  const supabase = await createClient()
  const { data } = await supabase.rpc('school_by_subdomain', { slug: resolution.slug })
  const row = (data as { name: string; logo_path: string | null }[] | null)?.[0]
  if (!row) return null

  let logoUrl: string | null = null
  if (row.logo_path) {
    const { data: signed } = await supabase.storage
      .from('school-logos')
      .createSignedUrl(row.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }
  return { name: row.name, logoUrl }
}
