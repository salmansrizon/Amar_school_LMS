import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'
import { createClient } from '@/lib/supabase/server'
import { isStudent } from '@/lib/student/guard'
import { requireSchoolMember } from '@/lib/auth/require-role'
import type { SupabaseClient } from '@supabase/supabase-js'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

/** Both sides of a submission open the same file: the Student who uploaded it
 *  and the teacher reviewing it. RLS on homework_submissions is what decides
 *  WHICH row each of them can reach, so the guard only has to admit both. */
const studentOrStaff = async (client: SupabaseClient) =>
  (await isStudent(client)) || (await requireSchoolMember(client))

export const GET = signedObjectRoute((req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return new Response('id is required', { status: 400 })
  return {
    bucket: 'submissions',
    table: 'homework_submissions',
    pathColumn: 'storage_path',
    match: { id },
  }
}, studentOrStaff)
