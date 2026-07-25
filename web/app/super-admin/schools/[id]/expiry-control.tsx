'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { setSubscriptionExpiry } from '../actions'

const input =
  'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

// Set/extend a school's subscription expiry directly (issue #162). Complements
// the code-redemption + decrease controls on the list; here the admin picks a
// date outright — to extend a lapsed window or correct an active one.
export function SchoolExpiryControl({
  schoolId,
  expiry,
  lang,
}: {
  schoolId: string
  expiry: string | null
  lang: Lang
}) {
  const router = useRouter()
  const [date, setDate] = useState(expiry ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <h2 className="mb-1 font-bold">{t('sa.expiry.set', lang)}</h2>
      <p className="mb-3 text-xs text-muted">{t('sa.expiry.hint', lang)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-muted">{t('sa.expiry.date', lang)}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        <button
          type="button"
          disabled={pending || !date}
          className={btn}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              setNote(null)
              const result = await setSubscriptionExpiry(schoolId, date)
              if (result.error) setError(result.error)
              else {
                setNote(t('sa.expiry.saved', lang))
                router.refresh()
              }
            })
          }
        >
          {t('sa.expiry.save', lang)}
        </button>
      </div>
      {note && <p className="mt-2 text-sm text-mint-deep">{note}</p>}
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
    </section>
  )
}
