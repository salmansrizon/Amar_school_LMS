'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { validateSlug } from '@/lib/subdomain'
import {
  generateClaimCode,
  renameSubdomain,
  sendOwnerReset,
  startTrial,
  updateSchoolHeader,
} from './actions'

const input =
  'h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const ghostBtn =
  'h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

export interface SchoolHeader {
  address_line: string | null
  mobile: string | null
  email: string | null
  eiin_no: string | null
}

export interface ClaimCode {
  code: string
  redeemed_at: string | null
}

// Per-school super-admin controls: edit header info, subdomain rename, trial,
// owner reset, claim code (issue #111).
export function SchoolManagement({
  schoolId,
  subdomain,
  hasOwner,
  header,
  codes,
  lang,
}: {
  schoolId: string
  subdomain: string | null
  hasOwner: boolean
  header: SchoolHeader
  codes: ClaimCode[]
  lang: Lang
}) {
  const [slug, setSlug] = useState(subdomain ?? '')
  const [days, setDays] = useState(15)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const slugChanged = slug.trim().toLowerCase() !== (subdomain ?? '')
  const slugError = slug.trim() ? validateSlug(slug) : null

  function run(fn: () => Promise<{ error?: string; code?: string }>, ok?: string) {
    startTransition(async () => {
      setError(null)
      setNote(null)
      const result = await fn()
      if (result.error) setError(result.error)
      else {
        if (result.code !== undefined) setCode(result.code ?? null)
        if (ok) setNote(ok)
      }
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      {/* Edit header info */}
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-muted">
          {t('schools.saveHeader', lang)}
        </summary>
        <form
          className="mt-2 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            run(() => updateSchoolHeader(schoolId, formData), t('schools.saved', lang))
          }}
        >
          <div>
            <label className={labelClass}>{t('schools.mobile', lang)}</label>
            <input name="mobile" defaultValue={header.mobile ?? ''} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('login.email', lang)}</label>
            <input name="email" type="email" defaultValue={header.email ?? ''} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('schools.eiin', lang)}</label>
            <input name="eiin_no" defaultValue={header.eiin_no ?? ''} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('schools.address', lang)}</label>
            <input name="address_line" defaultValue={header.address_line ?? ''} className={inputClass} />
          </div>
          <button type="submit" disabled={pending} className={`${btn} sm:col-span-2`}>
            {t('schools.saveHeader', lang)}
          </button>
        </form>
      </details>

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
        <button type="button" disabled={pending} className={ghostBtn} onClick={() => run(() => generateClaimCode(schoolId))}>
          {t('schools.newClaimCode', lang)}
        </button>
      </div>

      {!hasOwner && <p className="text-xs text-muted">{t('schools.noOwner', lang)}</p>}
      {code && (
        <p className="text-sm">
          {t('schools.claimCode', lang)}: <span className="font-mono">{code}</span>
        </p>
      )}

      {/* Claim-code registry: outstanding vs redeemed (issue #111). */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">{t('schools.claimCodes', lang)}</span>
        {codes.length === 0 ? (
          <span className="text-xs text-muted">{t('schools.noCodes', lang)}</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {codes.map((c) => (
              <li key={c.code} className="flex items-center gap-2 text-sm">
                <span className="font-mono">{c.code}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.redeemed_at ? 'bg-paper-muted text-muted' : 'bg-mint-soft text-mint-deep'
                  }`}
                >
                  {c.redeemed_at ? t('schools.redeemed', lang) : t('schools.available', lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {note && <p className="text-sm text-mint-deep">{note}</p>}
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
