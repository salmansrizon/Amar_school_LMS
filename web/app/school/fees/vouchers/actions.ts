'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

// Accounting II (issue #35, PRD §5.6): voucher categories (Income/Expense)
// and vouchers with an optional attachment. The file bytes are uploaded
// client-side straight to Storage (mirrors the syllabus/gallery pattern,
// 0026/0041) — these actions only manage the metadata rows; voucher_no and
// the 500KB-image/5MB-PDF attachment cap are both enforced by DB triggers
// (0054), not just here.

const PAGE = '/school/fees/vouchers'

export type ActionResult = { error?: string; savedId?: string }

export async function saveVoucherCategory(name: string, type: string): Promise<ActionResult> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required' }
  if (type !== 'income' && type !== 'expense') return { error: 'Type must be income or expense' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('voucher_categories')
    .insert({ name: trimmed, type })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { savedId: data.id }
}

function positiveAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n > 0 ? n : Number.NaN
}

export async function saveVoucher(formData: FormData): Promise<ActionResult> {
  const categoryId = String(formData.get('category_id') ?? '')
  const txnDate = String(formData.get('txn_date') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const amount = positiveAmount(formData.get('amount'))
  const attachmentPath = String(formData.get('attachment_path') ?? '').trim() || null
  const attachmentName = String(formData.get('attachment_name') ?? '').trim() || null
  const attachmentMime = String(formData.get('attachment_mime') ?? '').trim() || null
  const attachmentSizeRaw = formData.get('attachment_size')

  if (!categoryId) return { error: 'Category is required' }
  if (!description) return { error: 'Description is required' }
  if (Number.isNaN(amount)) return { error: 'Amount must be a positive number' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('vouchers')
    .insert({
      category_id: categoryId,
      txn_date: txnDate || undefined,
      description,
      amount,
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

/** The deterministic object path a client must upload a voucher attachment
 *  to: `{school_id}/voucher/{random}.{ext}` — the school_id segment is what
 *  Storage RLS checks (0054), and is always derived server-side, never
 *  trusted from the client. */
export async function voucherAttachmentUploadPath(ext: string): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  return { path: `${profile.school_id}/voucher/${crypto.randomUUID()}.${ext}` }
}
