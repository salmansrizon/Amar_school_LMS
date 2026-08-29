'use server'

import { currentActor } from '@/lib/school/actor'
import { createSignedUpload, type SignedUpload } from '@/lib/storage/signed-upload'

// Accounting II (issue #35, PRD §5.6): vouchers and assets share one private
// Storage bucket (`accounting-attachments`, 0055) with the same
// folder-per-school shape — this one action replaces what used to be two
// near-identical copies (voucherAttachmentUploadPath / assetAttachmentUploadPath).

export type AttachmentKind = 'voucher' | 'asset'

/** The deterministic object path a client must upload a voucher/asset
 *  attachment to: `{school_id}/{kind}/{random}.{ext}` — the school_id
 *  segment is what Storage RLS checks (0055), and is always derived
 *  server-side, never trusted from the client. */
export async function accountingAttachmentUploadTicket(
  kind: AttachmentKind,
  ext: string,
): Promise<{ upload?: SignedUpload; error?: string }> {
  const actor = await currentActor()
  if ('error' in actor) return { error: actor.error }
  // Same path, same authorisation — only the credential moves server-side (#527).
  return createSignedUpload('accounting-attachments', `${actor.schoolId}/${kind}/${crypto.randomUUID()}.${ext}`)
}
