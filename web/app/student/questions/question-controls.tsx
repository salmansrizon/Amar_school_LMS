'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { t, type Lang } from '@/lib/i18n'
import { markQuestionsSeen, withdrawQuestion } from '@/lib/student/messages-source'

/** Opening a conversation marks its replies as seen (#703 item 5.2). Renders
 *  nothing; the list's "new reply" mark clears on the next load. */
export function MarkSeen({ ids }: { ids: string[] }) {
  const key = ids.join(',')
  useEffect(() => {
    if (key) void markQuestionsSeen(key.split(','))
  }, [key])
  return null
}

/** Withdraw an unanswered question (#703 item 5.8). The database decides; a
 *  refusal is shown in the dialog. */
export function WithdrawQuestionButton({ id, lang, closeHref }: { id: string; lang: Lang; closeHref: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      triggerLabel={t('student.withdrawQuestion', lang)}
      triggerClassName="cursor-pointer rounded-full bg-alert-soft px-4 py-1.5 text-xs font-semibold text-alert-deep max-sm:min-h-11"
      title={t('student.confirmWithdraw', lang)}
      confirmLabel={t('student.withdrawQuestion', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => {
        const res = await withdrawQuestion(id)
        if (res.error) return { error: res.error === 'cannotWithdraw' ? t('student.cannotWithdraw', lang) : res.error }
        toast.success(t('student.questionWithdrawn', lang))
        // The open conversation no longer exists: drop ?view=<id> from the address.
        router.replace(closeHref)
        router.refresh()
      }}
    />
  )
}
