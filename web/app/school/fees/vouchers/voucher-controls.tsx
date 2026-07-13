'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { AttachmentPicker, type AttachmentMeta } from '../attachment-picker'
import { saveVoucher, saveVoucherCategory } from './actions'

export interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense'
}

/** New Voucher form (issue #35, PRD §5.6): Category (Income/Expense derived
 *  from it) + Date + Description + Amount + optional Attachment (the
 *  attachment picker itself is shared with the Asset form — attachment-picker.tsx). */
export function NewVoucherForm({ categories, lang }: { categories: CategoryOption[]; lang: Lang }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileMeta, setFileMeta] = useState<AttachmentMeta | null>(null)
  const [pickerKey, setPickerKey] = useState(0)
  const today = new Date().toISOString().slice(0, 10)

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
          setPickerKey((k) => k + 1) // remounts AttachmentPicker to clear its file input
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
        <AttachmentPicker key={pickerKey} kind="voucher" lang={lang} onUploaded={setFileMeta} onUploadingChange={setUploading} />
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
