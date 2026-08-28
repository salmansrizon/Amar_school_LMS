import { createClient as createBareClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/** A one-shot permission to write exactly one object. */
export interface SignedUpload {
  path: string
  token: string
}

/** Mint a signed upload for one object path, on the server.
 *
 *  The mirror of `signed-object.ts`, which mints signed *download* URLs so a
 *  private bucket can be read without handing the browser a session. This does the
 *  same for writes, and exists for the same reason one step further on: the
 *  browser currently uploads straight to Storage using its own session, which is
 *  only possible while the session cookie is readable by page JavaScript. That
 *  readability is the #526 finding, and #527 is removing it.
 *
 *  So every direct-to-Storage upload has to stop depending on a browser session
 *  without becoming a proxy through the server — streaming a syllabus PDF through
 *  a server action would meet Vercel's request body limit and turn a direct upload
 *  into a round trip. A signed upload keeps the bytes going straight to Storage
 *  and moves only the *authorisation* to the server.
 *
 *  The caller is authorised the way it always was: this runs as the signed-in
 *  user, so Storage RLS on the bucket decides whether the token is issued at all.
 *  Nothing here widens who may write where; it changes only where the credential
 *  lives. */
export async function createSignedUpload(
  bucket: string,
  path: string,
  opts: { upsert?: boolean } = {},
): Promise<{ upload?: SignedUpload; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: opts.upsert ?? true })
  if (error) return { error: error.message }
  return { upload: { path: data.path, token: data.token } }
}

/** Upload bytes with a signed token, from the browser, with no session at all.
 *
 *  Deliberately a bare supabase-js client rather than `lib/supabase/client.ts`:
 *  that one is wired to the session cookie, and the entire point here is that this
 *  path must not need one. The token in hand is the authorisation. */
export async function uploadWithSignedToken(
  bucket: string,
  upload: SignedUpload,
  file: File,
  contentType?: string,
): Promise<{ error?: string }> {
  const supabase = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, contentType ? { contentType } : undefined)
  return error ? { error: error.message } : {}
}
