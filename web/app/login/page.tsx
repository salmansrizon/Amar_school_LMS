import { headers } from 'next/headers'
import { LoginForm } from '@/components/login-form'
import { brandForHost } from '@/lib/school-branding-server'

// Server wrapper: resolve the subdomain's branding (issue #110) before the
// client form renders, so a tenant login shows the school's logo + name.
export default async function LoginPage() {
  const host = (await headers()).get('host')
  const brand = await brandForHost(host)
  return <LoginForm brand={brand} />
}
