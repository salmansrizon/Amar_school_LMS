'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { deleteSchool, generateClaimCode, setSchoolBlocked } from '../actions'

const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const ghostBtn =
  'h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'
const dangerBtn =
  'h-9 cursor-pointer rounded-full bg-alert px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50'

interface ActivationLink {
  code: string
  url: string
}

// Client controls for the super-admin school-detail page (issue #161):
// block/unblock, activation-link management (copy), and the delete danger zone.
export function SchoolDetailControls({
  schoolId,
  schoolName,
  blocked,
  activationLinks,
  lang,
}: {
  schoolId: string
  schoolName: string
  blocked: boolean
  activationLinks: ActivationLink[]
  lang: Lang
}) {
  const router = useRouter()
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function copy(url: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Activation links */}
      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-1 font-bold">{t('sa.school.activationLink', lang)}</h2>
        <p className="mb-3 text-xs text-muted">{t('sa.school.activationHint', lang)}</p>
        {activationLinks.length === 0 ? (
          <p className="mb-3 text-sm text-muted">{t('sa.school.noActivation', lang)}</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-2">
            {activationLinks.map((l) => (
              <li key={l.code} className="flex items-center gap-2">
                <input readOnly value={l.url} className="h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-paper-muted px-2 font-mono text-xs" />
                <button type="button" className={ghostBtn} onClick={() => copy(l.url)}>
                  {copied === l.url ? t('sa.school.copied', lang) : t('sa.school.copyLink', lang)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await generateClaimCode(schoolId)
              if (result.error) setError(result.error)
              else router.refresh()
            })
          }
        >
          {t('sa.school.newActivation', lang)}
        </button>
      </section>

      {/* Pause / resume (the deactivated_at flag — map #171 T4) */}
      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-1 font-bold">{blocked ? t('sa.school.paused', lang) : t('sa.school.pause', lang)}</h2>
        <p className="mb-3 text-xs text-muted">{t('sa.school.pauseNote', lang)}</p>
        <button
          type="button"
          disabled={pending}
          className={blocked ? btn : ghostBtn}
          onClick={() => {
            if (!blocked && !confirm(t('sa.school.pauseConfirm', lang))) return
            startTransition(async () => {
              setError(null)
              const result = await setSchoolBlocked(schoolId, !blocked)
              if (result.error) setError(result.error)
              else router.refresh()
            })
          }}
        >
          {blocked ? t('sa.school.resume', lang) : t('sa.school.pause', lang)}
        </button>
      </section>

      {/* Danger zone: delete */}
      <section className="rounded-lg border border-alert/40 bg-alert-soft/30 p-5 shadow-card">
        <h2 className="mb-1 font-bold text-alert-deep">{t('sa.school.dangerZone', lang)}</h2>
        <p className="mb-3 text-xs text-muted">{t('sa.school.deleteNote', lang)}</p>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('sa.school.deleteHint', lang)}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={schoolName}
            className="h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-alert"
          />
          <button
            type="button"
            disabled={pending || confirmName !== schoolName}
            className={dangerBtn}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await deleteSchool(schoolId)
                if (result.error) setError(result.error)
                else router.push('/super-admin/schools')
              })
            }
          >
            {t('sa.school.delete', lang)}
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
