'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

// Accounting II (issue #35, PRD §5.6): asset categories + the asset register
// (purchase value, depreciation rate, optional attachment). Same
// client-direct-upload-to-Storage shape as vouchers/syllabus/gallery; the
// 500KB-image/5MB-PDF cap is enforced by a DB trigger (0054), not just here.

const PAGE = '/school/fees/assets'

export type ActionResult = { error?: string; savedId?: string }

export async function saveAssetCategory(name: string): Promise<ActionResult> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('asset_categories')
    .insert({ name: trimmed })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { savedId: data.id }
}

function nonNegativeAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN
}

export async function saveAsset(formData: FormData): Promise<ActionResult> {
  const categoryId = String(formData.get('category_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const purchaseDate = String(formData.get('purchase_date') ?? '').trim()
  const purchaseValue = nonNegativeAmount(formData.get('purchase_value'))
  const depreciationRate = nonNegativeAmount(formData.get('depreciation_rate_percent'))
  const attachmentPath = String(formData.get('attachment_path') ?? '').trim() || null
  const attachmentName = String(formData.get('attachment_name') ?? '').trim() || null
  const attachmentMime = String(formData.get('attachment_mime') ?? '').trim() || null
  const attachmentSizeRaw = formData.get('attachment_size')

  if (!categoryId) return { error: 'Category is required' }
  if (!name) return { error: 'Asset name is required' }
  if (Number.isNaN(purchaseValue)) return { error: 'Purchase value must be a non-negative number' }
  if (Number.isNaN(depreciationRate) || depreciationRate > 100) {
    return { error: 'Depreciation rate must be between 0 and 100' }
  }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      category_id: categoryId,
      name,
      purchase_date: purchaseDate || undefined,
      purchase_value: purchaseValue,
      depreciation_rate_percent: depreciationRate,
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
      attachment_mime: attachmentMime,
      attachment_size: attachmentSizeRaw ? Number(attachmentSizeRaw) : null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { savedId: data.id }
}

/** The deterministic object path a client must upload an asset attachment
 *  to: `{school_id}/asset/{random}.{ext}` — mirrors voucherAttachmentUploadPath. */
export async function assetAttachmentUploadPath(ext: string): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  return { path: `${profile.school_id}/asset/${crypto.randomUUID()}.${ext}` }
}
