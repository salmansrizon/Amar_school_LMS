'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { totalPayable, dueAmount } from '@/lib/fees'
import { saveFeeRecord, calculateAbsentFine } from './actions'
import { selectClass } from '@/components/ui/field'

export interface CollectStudent {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
}

export interface ExistingFeeRecord {
  id: string
  pay_amount: number
  fine_amount: number
  adjust_amount: number
  payment_method: string
  note: string | null
}

/** Fee Collection form (issue #34, PRD §5.6) per ui/school-owner/fee-collection.html:
 *  Fee (prescribed, from the Class's monthly Fee Structure) / Fine (editable,
 *  with an absent-fine "Calculate" button) / Scholarship-Discount, computed
 *  Total Payable, Payment method, Received Amount, computed Due. */
export function FeeForm({
  student,
  month,
  year,
  existingRecord,
  prescribedFee,
  finePerDay,
  lang,
}: {
  student: CollectStudent
  month: number
  year: number
  existingRecord: ExistingFeeRecord | null
  prescribedFee: number
  finePerDay: number
  lang: Lang
}) {
  const router = useRouter()
  const [fee, setFee] = useState(prescribedFee)
  const [fine, setFine] = useState(existingRecord?.fine_amount ?? 0)
  const [adjust, setAdjust] = useState(existingRecord?.adjust_amount ?? 0)
  const [method, setMethod] = useState(existingRecord?.payment_method ?? 'cash')
  const total = totalPayable(fee, fine, adjust)
  const [received, setReceived] = useState(existingRecord?.pay_amount ?? total)
  const due = dueAmount(total, received)
  const [note, setNote] = useState(existingRecord?.note ?? '')

  const [absentDays, setAbsentDays] = useState<number | null>(null)
  const [calculating, startCalculating] = useTransition()
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const classLabel = [student.class_name, student.section].filter(Boolean).join(' / ')

  return (
    <form
      id="collect-form"
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData()
        data.set('student_id', student.id)
        data.set('month', String(month))
        data.set('year', String(year))
        if (existingRecord) data.set('edit_id', existingRecord.id)
        data.set('pay_amount', String(received))
        data.set('fine_amount', String(fine))
        data.set('adjust_amount', String(adjust))
        data.set('due_amount', String(due))
        data.set('payment_method', method)
        data.set('note', note)
        startSaving(async () => {
          setError(null)
          const result = await saveFeeRecord(data)
          if (result.error) {
            setError(result.error)
            return
          }
          if (result.existingId) {
            // Race: a record appeared between page load and submit — reload
            // into the edit flow instead of silently overwriting it.
            router.push(`/school/fees?student=${student.id}&month=${month}&year=${year}`)
            router.refresh()
            return
          }
          if (result.savedId) router.push(`/school/fees/receipt/${result.savedId}`)
        })
      }}
    >
      <h3 className="text-sm font-bold sm:col-span-4">
        {t('fees.collectAction', lang)} — {student.full_name}
        {student.roll_number !== null ? ` (${t('students.roll', lang)} ${student.roll_number})` : ''}
      </h3>
      <p className="-mt-2 text-xs text-muted sm:col-span-4">
        {classLabel || '—'} · {month}/{year}
      </p>

      <div>
        <label className={labelClass} htmlFor="fee_amount">
          {t('fees.feeAmount', lang)}
        </label>
        <input
          id="fee_amount"
          type="number"
          min={0}
          step="0.01"
          value={fee}
          onChange={(e) => setFee(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="fine_amount">
          {t('fees.fine', lang)}
        </label>
        <input
          id="fine_amount"
          type="number"
          min={0}
          step="0.01"
          value={fine}
          onChange={(e) => setFine(Number(e.target.value) || 0)}
          className={inputClass}
        />
        <button
          type="button"
          disabled={calculating}
          onClick={() =>
            startCalculating(async () => {
              setError(null)
              const result = await calculateAbsentFine(student.id, year, month, finePerDay)
              if (result.error) {
                setError(result.error)
                return
              }
              setAbsentDays(result.absentDays ?? 0)
              setFine(result.fineAmount ?? 0)
            })
          }
          className="mt-1 cursor-pointer text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50"
        >
          {calculating ? t('fees.calculating', lang) : t('fees.calculateFine', lang)}
        </button>
        {absentDays !== null && (
          <p className="mt-0.5 text-xs text-muted">
            {t('fees.absentDays', lang)}: {absentDays}
          </p>
        )}
      </div>
      <div>
        <label className={labelClass} htmlFor="adjust_amount">
          {t('fees.adjust', lang)}
        </label>
        <input
          id="adjust_amount"
          type="number"
          min={0}
          step="0.01"
          value={adjust}
          onChange={(e) => setAdjust(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="total_payable">
          {t('fees.totalPayable', lang)}
        </label>
        <input id="total_payable" type="text" disabled value={`৳${total.toFixed(2)}`} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="payment_method">
          {t('fees.method', lang)}
        </label>
        <select
          id="payment_method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={selectClass({ size: 'md', fullWidth: true })}
        >
          <option value="cash">{t('fees.cash', lang)}</option>
          <option value="cheque">{t('fees.cheque', lang)}</option>
          <option value="bank">{t('fees.bank', lang)}</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="received_amount">
          {t('fees.receivedAmount', lang)}
        </label>
        <input
          id="received_amount"
          type="number"
          min={0}
          step="0.01"
          value={received}
          onChange={(e) => setReceived(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="due_amount">
          {t('fees.due', lang)}
        </label>
        <input id="due_amount" type="text" disabled value={`৳${due.toFixed(2)}`} className={inputClass} />
      </div>
      <div className="sm:col-span-4">
        <label className={labelClass} htmlFor="fee_note">
          {t('fees.note', lang)}
        </label>
        <input
          id="fee_note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('fees.notePlaceholder', lang)}
          className={inputClass}
        />
      </div>

      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={saving} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('fees.collectAndPrint', lang)}
      </button>
    </form>
  )
}
