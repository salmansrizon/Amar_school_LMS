'use client'

import { useState } from 'react'
import { useCrudAction } from '@/lib/crud/use-crud-action'
import { t, type Lang } from '@/lib/i18n'
import { decideWorkflow } from './actions'

export function DecideControls({ instanceId, lang }: { instanceId: string; lang: Lang }) {
  const { error, pending, run } = useCrudAction(decideWorkflow)
  const [comment, setComment] = useState('')

  const decide = (decision: 'approved' | 'rejected') => {
    const d = new FormData()
    d.set('instance_id', instanceId)
    d.set('decision', decision)
    d.set('comment', comment)
    run(d)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('approvals.comment', lang)}
        className="h-9 w-48 rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide('approved')}
          className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('approvals.approve', lang)}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide('rejected')}
          className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
        >
          {t('approvals.reject', lang)}
        </button>
      </div>
      {error && <p className="text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
