'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { AttachmentPicker, type AttachmentMeta } from '../attachment-picker'
import { saveAsset, saveAssetCategory } from './actions'
import { dateInputClass, selectClass } from '@/components/ui/field'

export interface AssetCategoryOption {
  id: string
  name: string
}

/** New Asset form (issue #35, PRD §5.6): Category + Name + Purchase Date +
 *  Purchase Value + Depreciation rate (%/year) + optional Attachment (the
 *  attachment picker itself is shared with the Voucher form — attachment-picker.tsx). */
export function NewAssetForm({ categories, lang }: { categories: AssetCategoryOption[]; lang: Lang }) {
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
          const result = await saveAsset(data)
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
          {t('assets.category', lang)}
        </label>
        <select id="category_id" name="category_id" required defaultValue="" className={selectClass({ size: 'md', fullWidth: true })}>
          <option value="" disabled>
            {t('assets.pickCategory', lang)}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="name">
          {t('assets.name', lang)}
        </label>
        <input id="name" name="name" type="text" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="purchase_date">
          {t('assets.purchaseDate', lang)}
        </label>
        <input id="purchase_date" name="purchase_date" type="date" defaultValue={today} className={dateInputClass({ size: 'md', fullWidth: true })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="purchase_value">
          {t('assets.purchaseValue', lang)}
        </label>
        <input
          id="purchase_value"
          name="purchase_value"
          type="number"
          min={0}
          step="0.01"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="depreciation_rate_percent">
          {t('assets.depreciationRate', lang)}
        </label>
        <input
          id="depreciation_rate_percent"
          name="depreciation_rate_percent"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={0}
          className={inputClass}
        />
      </div>
      <div className="sm:col-span-3">
        <AttachmentPicker key={pickerKey} kind="asset" lang={lang} onUploaded={setFileMeta} onUploadingChange={setUploading} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending || uploading} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('assets.save', lang)}
      </button>
    </form>
  )
}

/** Minimal category management, same rationale as vouchers' — no dedicated
 *  mockup screen, but required plumbing for the Category select above. */
export function NewAssetCategoryForm({ lang }: { lang: Lang }) {
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
        startTransition(async () => {
          setError(null)
          const result = await saveAssetCategory(name)
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
          {t('assets.categoryName', lang)}
        </label>
        <input id="cat_name" name="name" type="text" required className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('assets.addCategory', lang)}
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}
