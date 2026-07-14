'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { parsePositiveAmount } from '@/lib/accounting'

// Accounting II (issue #35, PRD §5.6): voucher categories (Income/Expense)
// and vouchers with an optional attachment. The file bytes are uploaded
// client-side straight to Storage (mirrors the syllabus/gallery pattern,
// 0026/0041; the canonical upload path comes from the shared
// accountingAttachmentUploadPath in ../attachment-actions) — these actions
// only manage the metadata rows; voucher_no and the 500KB-image/5MB-PDF
// attachment cap are both enforced by DB triggers (0055), not just here.

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

export async function saveVoucher(formData: FormData): Promise<ActionResult> {
  const categoryId = String(formData.get('category_id') ?? '')
  const txnDate = String(formData.get('txn_date') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const amount = parsePositiveAmount(formData.get('amount'))
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
