'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { createStudentLogin, resetStudentPassword, type IssuedLogin } from '../login-actions'

// Student login panel on the student profile (#442). Owner-only: the page hides
// it for Staff Users, and create_student_login / set_student_password reject
// them anyway. A password appears here exactly once, right after it is issued.

const btnSecondary =
  'cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'
const btnPrimary =
  'cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const btnDanger =
  'cursor-pointer rounded-full border border-alert px-4 py-1.5 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50'

export interface StudentLoginStatus {
  email: string
  last_sign_in_at: string | null
}

export function StudentLoginPanel({
  lang,
  studentId,
  status,
  hasGuardianPhone,
}: {
  lang: Lang
  studentId: string
  status: StudentLoginStatus | null
  hasGuardianPhone: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedLogin | null>(null)
  const [sendSms, setSendSms] = useState(false)
  // Blank means "generate one" — the normal path. #442 also asks for "set a
  // password", so an owner who wants to choose one can.
  const [chosen, setChosen] = useState('')
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  const run = (action: () => Promise<{ login?: IssuedLogin; error?: string }>) =>
    startTransition(async () => {
      setError(null)
      const result = await action()
      if (result.error) {
        setError(result.error)
        return
      }
      setIssued(result.login ?? null)
      router.refresh()
    })

  return (
    <section className="mb-6 rounded-lg border border-line bg-paper p-5">
      <h2 className="mb-3 font-bold">{t('students.login', lang)}</h2>

      {status ? (
        <dl className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted">{t('students.loginUser', lang)}</dt>
            <dd className="text-sm break-all">{status.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">{t('students.loginLastUsed', lang)}</dt>
            <dd className="text-sm">
              {status.last_sign_in_at
                ? new Date(status.last_sign_in_at).toLocaleString(locale)
                : t('students.loginNeverUsed', lang)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mb-3 text-sm text-muted">{t('students.loginNone', lang)}</p>
      )}

      <div className="mb-3 max-w-xs">
        <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="chosen_password">
          {t('students.loginChoosePassword', lang)}
        </label>
        <input
          id="chosen_password"
          type="text"
          value={chosen}
          minLength={8}
          onChange={(e) => setChosen(e.target.value)}
          placeholder={t('students.loginGenerate', lang)}
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {hasGuardianPhone && (
        <label className="mb-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={sendSms}
            onChange={(e) => setSendSms(e.target.checked)}
            className="size-4"
          />
          {t('students.loginSms', lang)}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status ? (
          <ConfirmDialog
            triggerLabel={t('students.loginReset', lang)}
            triggerClassName={btnDanger}
            title={t('students.loginReset', lang)}
            body={t('students.loginResetConfirm', lang)}
            confirmLabel={t('students.loginReset', lang)}
            cancelLabel={t('routine.cancel', lang)}
            onConfirm={async () => {
              const result = await resetStudentPassword(studentId, sendSms, chosen)
              if (result.login) setIssued(result.login)
              if (!result.error) router.refresh()
              return result
            }}
          />
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => createStudentLogin(studentId, sendSms, chosen))}
            className={btnPrimary}
          >
            {t('students.loginCreate', lang)}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-alert-deep">{error}</p>}
      {issued && <CredentialSlip lang={lang} logins={[issued]} />}
    </section>
  )
}

/** The one place a password is ever rendered. Printable (browser-native, ADR
 *  0007) because handing a class its logins is a paper job. */
export function CredentialSlip({ lang, logins }: { lang: Lang; logins: IssuedLogin[] }) {
  return (
    <div className="print-slip mt-4 rounded-lg border border-brand-300 bg-brand-50 p-4">
      <p className="mb-3 text-xs font-semibold text-brand-700">
        {t('students.loginShownOnce', lang)}
      </p>
      <ul className="divide-y divide-brand-300">
        {logins.map((login) => (
          <li key={login.studentId} className="py-2 text-sm">
            <div className="font-semibold">
              {login.fullName}
              {login.studentNo ? ` · ${login.studentNo}` : ''}
            </div>
            <div className="break-all text-xs">
              {t('students.loginUser', lang)}: <code>{login.email}</code>
            </div>
            <div className="text-xs">
              {t('students.loginPassword', lang)}: <code>{login.password}</code>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          // Print the slip, not the page it happens to be sitting in. The
          // password is only ever in memory, so there is no /print/* route to
          // hand off to — the body class scopes the print instead (globals.css).
          document.body.classList.add('printing-slip')
          window.print()
          document.body.classList.remove('printing-slip')
        }}
        className={`mt-3 print:hidden ${btnSecondary}`}
      >
        {t('students.loginPrint', lang)}
      </button>
    </div>
  )
}
