import { createClient } from '@supabase/supabase-js'
import type { SignedUpload } from './signed-upload'

/** Send bytes to Storage with a signed token, from the browser, with no session.
 *
 *  Its own file rather than sitting beside `createSignedUpload`, because that
 *  module imports the server Supabase client and therefore `next/headers`, which a
 *  client component cannot pull in.
 *
 *  Deliberately a bare supabase-js client and not `lib/supabase/client.ts`: that
 *  one is wired to the session cookie, and the entire point of #527 is that this
 *  path must not need one. The token in hand is the authorisation. */
export async function uploadWithSignedToken(
  bucket: string,
  upload: SignedUpload,
  // Blob, not File: several call sites compress or re-encode an image before
  // uploading, and the result of that is a Blob.
  file: Blob,
  contentType?: string,
): Promise<{ error?: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, contentType ? { contentType } : undefined)
  return error ? { error: error.message } : {}
}
