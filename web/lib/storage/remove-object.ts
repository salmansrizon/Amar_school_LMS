'use server'

import { createClient } from '@/lib/supabase/server'

/** Delete an object the caller is allowed to delete.
 *
 *  Its own `'use server'` module rather than sitting beside `createSignedUpload`.
 *  A client component may *call* a server action, but it must never *import* a
 *  module that reaches for `next/headers` — and the upload-ticket helpers do, via
 *  the server Supabase client. Putting this next to them built fine under
 *  typecheck and failed the production build, which is the only place that
 *  boundary is actually enforced.
 *
 *  Several upload sites remove the object they just wrote when the database write
 *  that should have recorded it fails, so the bucket does not accumulate files
 *  nothing points at. That rollback used the browser's own session too.
 *
 *  A signed token cannot express a delete, so this one genuinely is a server round
 *  trip — which is fine, because it carries a path rather than a file.
 *
 *  Best-effort by design: this is already the failure path, and a failed cleanup
 *  must not replace the error the caller is trying to report. */
export async function removeUploadedObject(bucket: string, path: string): Promise<void> {
  const supabase = await createClient()
  await supabase.storage.from(bucket).remove([path])
}
