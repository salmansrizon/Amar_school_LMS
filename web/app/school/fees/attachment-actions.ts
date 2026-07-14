'use server'

import { createClient } from '@/lib/supabase/server'

// Accounting II (issue #35, PRD §5.6): vouchers and assets share one private
// Storage bucket (`accounting-attachments`, 0055) with the same
// folder-per-school shape — this one action replaces what used to be two
// near-identical copies (voucherAttachmentUploadPath / assetAttachmentUploadPath).

export type AttachmentKind = 'voucher' | 'asset'

/** The deterministic object path a client must upload a voucher/asset
 *  attachment to: `{school_id}/{kind}/{random}.{ext}` — the school_id
 *  segment is what Storage RLS checks (0055), and is always derived
 *  server-side, never trusted from the client. */
export async function accountingAttachmentUploadPath(
  kind: AttachmentKind,
  ext: string,
): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  return { path: `${profile.school_id}/${kind}/${crypto.randomUUID()}.${ext}` }
}
