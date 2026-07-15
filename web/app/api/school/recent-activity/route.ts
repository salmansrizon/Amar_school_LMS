import { createClient } from '@/lib/supabase/server'
import { mergeActivity } from '@/lib/dashboard'

// Recent activity for the topbar notification-bell popover. RLS scopes every
// query to the caller's school, so no explicit school filter is needed.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const [{ data: students }, { data: notices }, { data: feedback }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('publications').select('id, title, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('feedback_messages').select('id, subject, created_at').order('created_at', { ascending: false }).limit(6),
  ])

  const items = mergeActivity(
    { students: students ?? [], notices: notices ?? [], feedback: feedback ?? [] },
    6,
  )
  return Response.json({ items })
}
