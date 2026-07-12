'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { saveVoucher, saveVoucherCategory, voucherAttachmentUploadPath } from './actions'

export interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense'
}

// Mirrors the DB-enforced caps (0054's enforce_attachment_cap): 500KB image,
// 5MB PDF (PRD §7). These are only the UI's early check — the trigger is the
// real authority.
const MAX_IMAGE_BYTES = 512000
const MAX_PDF_BYTES = 5242880

function extFor(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'application/pdf') return 'pdf'
  return null
}

/** New Voucher form (issue #35, PRD §5.6): Category (Income/Expense derived
 *  from it) + Date + Description + Amount + optional Attachment. */
export function NewVoucherForm({ categories, lang }: { categories: CategoryOption[]; lang: Lang }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileMeta, setFileMeta] = useState<{ path: string; name: string; mime: string; size: number } | null>(
    null,
  )
  const today = new Date().toISOString().slice(0, 10)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const ext = extFor(file.type)
    if (!ext) {
      setError(t('vouchers.badType', lang))
      return
    }
    const cap = file.type.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_PDF_BYTES
    if (file.size > cap) {
      setError(t('vouchers.tooBig', lang))
      return
    }
    setUploading(true)
    const { path, error: pathErr } = await voucherAttachmentUploadPath(ext)
    if (pathErr || !path) {
      setError(pathErr ?? 'Upload failed')
      setUploading(false)
      return
    }
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('accounting-attachments')
      .upload(path, file, { contentType: file.type })
    setUploading(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setFileMeta({ path, name: file.name, mime: file.type, size: file.size })
  }

  return (
    <form
      ref={formRef}
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        if (fileMeta) {
          data.set('attachment_path', fileMeta.path)
          data.set('attachment_name', fileMeta.name)
          data.set('attachment_mime', fileMeta.mime)
          data.set('attachment_size', String(fileMeta.size))
        }
        startTransition(async () => {
          setError(null)
          const result = await saveVoucher(data)
          if (result.error) {
            setError(result.error)
            return
          }
          formRef.current?.reset()
          setFileMeta(null)
          if (fileRef.current) fileRef.current.value = ''
          router.refresh()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="category_id">
          {t('vouchers.category', lang)}
        </label>
        <select id="category_id" name="category_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {t('vouchers.pickCategory', lang)}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({t(c.type === 'income' ? 'vouchers.income' : 'vouchers.expense', lang)})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="txn_date">
          {t('vouchers.date', lang)}
        </label>
        <input id="txn_date" name="txn_date" type="date" defaultValue={today} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="description">
          {t('vouchers.description', lang)}
        </label>
        <input id="description" name="description" type="text" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="amount">
          {t('vouchers.amount', lang)}
        </label>
        <input id="amount" name="amount" type="number" min={0.01} step="0.01" required className={inputClass} />
      </div>
      <div className="sm:col-span-3">
        <label className={labelClass}>{t('vouchers.attachFile', lang)}</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onPick}
          disabled={uploading}
          className="w-full text-sm"
        />
        {fileMeta && <p className="mt-1 text-xs text-muted">📎 {fileMeta.name}</p>}
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending || uploading} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('vouchers.save', lang)}
      </button>
    </form>
  )
}

/** Minimal category management (name + Income/Expense) — the mockup's list
 *  screen doesn't dedicate space to this, but categories must come from
 *  somewhere for the Voucher form's Category select above. */
export function NewVoucherCategoryForm({ lang }: { lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        const name = String(data.get('name') ?? '')
        const type = String(data.get('type') ?? '')
        startTransition(async () => {
          setError(null)
          const result = await saveVoucherCategory(name, type)
          if (result.error) {
            setError(result.error)
            return
          }
          form.reset()
          router.refresh()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="cat_name">
          {t('vouchers.categoryName', lang)}
        </label>
        <input id="cat_name" name="name" type="text" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cat_type">
          {t('vouchers.type', lang)}
        </label>
        <select id="cat_type" name="type" required defaultValue="income" className={inputClass}>
          <option value="income">{t('vouchers.income', lang)}</option>
          <option value="expense">{t('vouchers.expense', lang)}</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('vouchers.addCategory', lang)}
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}
