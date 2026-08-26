import { signedObjectRoute } from '@/lib/storage/signed-object'
import { isStudent } from '@/lib/student/guard'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

// A Student's own photo, for their admit card (#450).
//
// Reads `student_self`, not `students` — a Student has no policy on the table,
// and the view is already filtered to their own row, so there is nothing to key
// on and no way to ask for somebody else's.
export const GET = signedObjectRoute(
  () => ({ bucket: 'student-photos', table: 'student_self', pathColumn: 'photo_path' }),
  isStudent,
)
