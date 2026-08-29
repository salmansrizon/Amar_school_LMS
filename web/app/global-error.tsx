'use client'

import { ErrorState } from '@/components/ui/states'
import { DEFAULT_LANG } from '@/lib/i18n'

// The root layout itself failed, so nothing above this rendered — this file must
// supply <html> and <body> of its own. It cannot read the language cookie
// through the shell, and a broken root is not the moment to depend on one, so it
// speaks the default (Bangla, ADR 0004).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang={DEFAULT_LANG}>
      <body>
        <ErrorState reference={error.digest} onRetry={reset} homeHref="/" lang={DEFAULT_LANG} />
      </body>
    </html>
  )
}
