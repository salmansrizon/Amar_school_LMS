import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { SchoolShell } from '@/components/school-shell'
import type { Role } from '@/lib/auth/routing'

// Persistent chrome for every /school/* page (ADR: sidebar per
// ui/school-owner/dashboard.html). Re-verifies the session server-side; the
// proxy check (proxy.ts) is only optimistic.
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'school_owner' && profile.role !== 'staff_user')) redirect('/login')
  const role = profile.role as Role

  let grants: string[] = []
  if (role === 'staff_user') {
    const { data: perms } = await supabase.from('staff_permissions').select('screen_key').eq('staff_user_id', user.id)
    grants = (perms ?? []).map((p) => p.screen_key)
  }

  const { data: school } = await supabase.from('schools').select('name').eq('id', profile.school_id).maybeSingle()

  return (
    <SchoolShell
      role={role}
      grants={grants}
      schoolName={school?.name ?? t('home.school', lang)}
      fullName={profile.full_name ?? user.email ?? ''}
      lang={lang}
    >
      {children}
    </SchoolShell>
  )
}
