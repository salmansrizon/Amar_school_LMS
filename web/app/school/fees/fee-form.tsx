'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { saveFeeRecord } from './actions'

export function FeeForm({
  students,
  lang,
}: {
  students: { id: string; full_name: string; class_name: string | null }[]
  lang: Lang
}) {
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const now = new Date()

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        if (editId) data.set('edit_id', editId)
        startTransition(async () => {
          setError(null)
          const result = await saveFeeRecord(data)
          if (result.existingId) {
            // Legacy behavior: same-month record exists → switch to editing it.
            setEditId(result.existingId)
            return
          }
          if (result.error) {
            setError(result.error)
            return
          }
          setEditId(null)
          form.reset()
        })
      }}
    >
      {editId && (
        <p className="rounded-md bg-sun-soft px-3 py-2 text-sm font-medium text-sun-deep sm:col-span-4">
          {t('fees.editing', lang)}
        </p>
      )}
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="fee_student">{t('fees.student', lang)}</label>
        <select id="fee_student" name="student_id" required className={inputClass} onChange={() => setEditId(null)}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
              {s.class_name ? ` — ${s.class_name}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_month">{t('fees.month', lang)}</label>
        <input id="fee_month" name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required className={inputClass} onChange={() => setEditId(null)} />
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_year">{t('fees.year', lang)}</label>
        <input id="fee_year" name="year" type="number" min={2000} max={2100} defaultValue={now.getFullYear()} required className={inputClass} onChange={() => setEditId(null)} />
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_pay">{t('fees.pay', lang)}</label>
        <input id="fee_pay" name="pay_amount" type="number" min={0} step="0.01" defaultValue={0} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_fine">{t('fees.fine', lang)}</label>
        <input id="fee_fine" name="fine_amount" type="number" min={0} step="0.01" defaultValue={0} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_adjust">{t('fees.adjust', lang)}</label>
        <input id="fee_adjust" name="adjust_amount" type="number" min={0} step="0.01" defaultValue={0} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_due">{t('fees.due', lang)}</label>
        <input id="fee_due" name="due_amount" type="number" min={0} step="0.01" defaultValue={0} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="fee_method">{t('fees.method', lang)}</label>
        <select id="fee_method" name="payment_method" className={inputClass}>
          <option value="cash">{t('fees.cash', lang)}</option>
          <option value="cheque">{t('fees.cheque', lang)}</option>
          <option value="bank">{t('fees.bank', lang)}</option>
        </select>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('fees.save', lang)}
      </button>
    </form>
  )
}
