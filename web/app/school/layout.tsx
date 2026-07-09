import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SchoolShell } from './school-shell'

// Shared sidebar shell for every /school page (matches the GitHub Pages mockup).
// The proxy already gates this group; we re-read the role to pick the nav set.
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'school_owner' && profile?.role !== 'staff_user') redirect('/login')

  return <SchoolShell role={profile.role as 'school_owner' | 'staff_user'}>{children}</SchoolShell>
}
