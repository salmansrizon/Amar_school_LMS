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
 *  browser used to upload straight to Storage using its own session, which is only
 *  possible while the session cookie is readable by page JavaScript. That
 *  readability is the #526 finding, and #527 removes it.
 *
 *  So every direct-to-Storage upload had to stop depending on a browser session
 *  without becoming a proxy through the server — streaming a syllabus PDF through
 *  a server action would meet Vercel's request body limit and turn a direct upload
 *  into a round trip. A signed upload keeps the bytes going straight to Storage
 *  and moves only the *authorisation*.
 *
 *  Authorisation is unchanged: this runs as the signed-in caller, so Storage RLS
 *  decides whether a token is issued at all. What moves is where the credential
 *  lives, not who may write where.
 *
 *  Server-only. The browser half lives in `upload-client.ts`, deliberately in its
 *  own file: this one imports the server Supabase client, which reaches for
 *  `next/headers` and cannot be pulled into a client component. */
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
