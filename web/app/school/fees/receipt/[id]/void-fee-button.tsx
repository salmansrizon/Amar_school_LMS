'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { inputClass, labelClass } from '@/components/auth-card'
import { cleanVoidReason, VOID_REASON_MAX } from '@/lib/fees'
import { t, formatMoney, type Lang } from '@/lib/i18n'
import { voidFeeRecord } from '../../actions'

/** Void a Fee Collection Record (#683): a confirm step that names what the
 *  ledger will reverse and will not go ahead without a reason. The record is
 *  kept; the server action and the database trigger (0231) do the rest. */
export function VoidFeeButton({
  recordId,
  pay,
  fine,
  lang,
}: {
  recordId: string
  pay: number
  fine: number
  lang: Lang
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')

  return (
    <ConfirmDialog
      triggerLabel={t('fees.voidAction', lang)}
      triggerClassName="cursor-pointer rounded-full border border-alert/40 px-4 py-1.5 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
      title={t('fees.voidTitle', lang)}
      body={t('fees.voidBody', lang)}
      confirmLabel={t('fees.voidConfirm', lang)}
      cancelLabel={t('fees.voidKeep', lang)}
      confirmDisabled={!cleanVoidReason(reason)}
      onConfirm={async () => {
        const result = await voidFeeRecord(recordId, reason)
        if (result.error) return result
        toast.success(t('fees.voidDone', lang))
        router.refresh()
      }}
    >
      <div className="mb-4 rounded-md border border-line px-3 py-2 text-sm">
        <p className="mb-1 text-xs font-semibold text-muted">{t('fees.voidReversal', lang)}</p>
        <p className="flex justify-between">
          <span>{t('fees.receivedAmount', lang)}</span>
          <span>{formatMoney(pay, lang)}</span>
        </p>
        <p className="flex justify-between">
          <span>{t('fees.fine', lang)}</span>
          <span>{formatMoney(fine, lang)}</span>
        </p>
      </div>
      <div className="mb-4">
        <label className={labelClass} htmlFor="void_reason">
          {t('fees.voidReason', lang)}
        </label>
        <textarea
          id="void_reason"
          required
          rows={3}
          maxLength={VOID_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
        />
        {!cleanVoidReason(reason) && <p className="mt-1 text-xs text-muted">{t('fees.voidReasonRequired', lang)}</p>}
      </div>
    </ConfirmDialog>
  )
}
