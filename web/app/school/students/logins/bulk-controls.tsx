'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { createClassLogins, type BulkResult } from '../login-actions'
import { CredentialSlip } from '../[id]/login-controls'

// The preview → commit → slips half of the class login screen (#442). The
// preview is server-rendered above this; this holds the act and its result.

// `klass`, not `className`: on a React component that prop means a CSS class,
// and this one is a school Class. The students list dodges the same collision.
export function BulkLoginControls({
  lang,
  klass,
  section,
  candidates,
}: {
  lang: Lang
  klass: string
  section: string
  candidates: { id: string; full_name: string; student_no: string | null; roll_number: number | null }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<BulkResult | null>(null)
  const [sendSms, setSendSms] = useState(false)

  if (!candidates.length && !result) {
    return <p className="text-sm text-muted">{t('students.loginBulkNone', lang)}</p>
  }

  return (
    <div>
      {!result && (
        <>
          <h3 className="mb-2 text-sm font-bold">
            {t('students.loginBulkPreview', lang)} · {candidates.length}
          </h3>
          <ul className="mb-4 divide-y divide-line">
            {candidates.map((s) => (
              <li key={s.id} className="flex justify-between py-1.5 text-sm">
                <span>{s.full_name}</span>
                <span className="text-xs text-muted">
                  {[s.student_no, s.roll_number !== null ? `#${s.roll_number}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>

          <label className="mb-3 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={sendSms}
              onChange={(e) => setSendSms(e.target.checked)}
              className="size-4"
            />
            {t('students.loginSms', lang)}
          </label>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await createClassLogins(klass, section, sendSms))
                router.refresh()
              })
            }
            className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {t('students.loginCreate', lang)}
          </button>
        </>
      )}

      {result?.error && <p className="text-sm text-alert-deep">{result.error}</p>}

      {result && result.failed.length > 0 && (
        <div className="mb-4 rounded-lg border border-alert bg-alert-soft p-3 print:hidden">
          <h3 className="mb-2 text-sm font-bold text-alert-deep">
            {t('students.loginBulkFailed', lang)} · {result.failed.length}
          </h3>
          <ul className="text-xs text-alert-deep">
            {result.failed.map((f) => (
              <li key={f.fullName}>
                {f.fullName} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.issued.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-bold">
            {t('students.loginBulkIssued', lang)} · {result.issued.length}
          </h3>
          <CredentialSlip lang={lang} logins={result.issued} />
        </>
      )}
    </div>
  )
}
