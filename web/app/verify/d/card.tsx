import type { ReactNode } from 'react'
import { LangSwitch } from '@/components/lang-switch'
import { t, type Lang } from '@/lib/i18n'

/** The bare card both verification outcomes render in: no session, no chrome,
 *  only the language switch. */
export function VerifyCard({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper-muted p-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-paper p-6 text-center">{children}</div>
      <LangSwitch lang={lang} />
    </main>
  )
}

export function VerifyBadge({ valid, label }: { valid: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ring-1 ${
        valid ? 'bg-mint-soft text-mint-deep ring-mint-deep/20' : 'bg-alert-soft text-alert-deep ring-alert-deep/20'
      }`}
    >
      <span aria-hidden="true">{valid ? '✓' : '✕'}</span>
      {label}
    </span>
  )
}

/** "This code is not valid": one page for an unknown kind, a bad token, a bad
 *  reference and a function that is not there yet. Nothing on it depends on
 *  which of those happened. */
export function CodeNotValid({ lang }: { lang: Lang }) {
  return (
    <VerifyCard lang={lang}>
      <VerifyBadge valid={false} label={t('verifyDoc.codeNotValid', lang)} />
      <p className="mt-4 text-sm text-muted">{t('verifyDoc.codeNotValidNote', lang)}</p>
    </VerifyCard>
  )
}
