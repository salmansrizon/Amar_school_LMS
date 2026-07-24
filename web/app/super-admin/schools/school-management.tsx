'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { validateSlug } from '@/lib/subdomain'
import { generateClaimCode, renameSubdomain, sendOwnerReset, startTrial } from './actions'

const input =
  'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const ghostBtn =
  'h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

// Per-school super-admin controls: subdomain rename, trial, owner reset, claim
// code (issue #111).
export function SchoolManagement({
  schoolId,
  subdomain,
  hasOwner,
  lang,
}: {
  schoolId: string
  subdomain: string | null
  hasOwner: boolean
  lang: Lang
}) {
  const [slug, setSlug] = useState(subdomain ?? '')
  const [days, setDays] = useState(15)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [pending, startTransitionFn] = useTransition()

  const slugChanged = slug.trim().toLowerCase() !== (subdomain ?? '')
  const slugError = slug.trim() ? validateSlug(slug) : null

  function run(fn: () => Promise<{ error?: string }>, ok?: string) {
    startTransitionFn(async () => {
      setError(null)
      setNote(null)
      const result = await fn()
      if (result.error) setError(result.error)
      else if (ok) setNote(ok)
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      {/* Subdomain rename */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted">{t('schools.subdomain', lang)}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t('schools.subdomainNone', lang)}
            className={`${input} font-mono`}
          />
          <button
            type="button"
            disabled={pending || !slugChanged || slugError !== null || !slug.trim()}
            className={btn}
            onClick={() => run(() => renameSubdomain(schoolId, slug), t('schools.saved', lang))}
          >
            {t('schools.rename', lang)}
          </button>
        </div>
        {slugChanged && subdomain && <p className="text-xs text-alert-deep">{t('schools.renameWarn', lang)}</p>}
      </div>

      {/* Start trial + owner reset + new claim code */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-muted">{t('schools.trialDays', lang)}</label>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
          className={`${input} w-20`}
        />
        <button type="button" disabled={pending} className={ghostBtn} onClick={() => run(() => startTrial(schoolId, days))}>
          {t('schools.startTrial', lang)}
        </button>
        <button
          type="button"
          disabled={pending || !hasOwner}
          className={ghostBtn}
          title={hasOwner ? undefined : t('schools.noOwner', lang)}
          onClick={() => run(() => sendOwnerReset(schoolId), t('schools.resetSent', lang))}
        >
          {t('schools.sendReset', lang)}
        </button>
        <button
          type="button"
          disabled={pending}
          className={ghostBtn}
          onClick={() =>
            startTransitionFn(async () => {
              setError(null)
              setNote(null)
              const result = await generateClaimCode(schoolId)
              if (result.error) setError(result.error)
              else setCode(result.code ?? null)
            })
          }
        >
          {t('schools.newClaimCode', lang)}
        </button>
      </div>

      {!hasOwner && <p className="text-xs text-muted">{t('schools.noOwner', lang)}</p>}
      {code && (
        <p className="text-sm">
          {t('schools.claimCode', lang)}: <span className="font-mono">{code}</span>
        </p>
      )}
      {note && <p className="text-sm text-mint-deep">{note}</p>}
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
