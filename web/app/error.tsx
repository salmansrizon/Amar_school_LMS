'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/states'
import { useLang } from '@/lib/use-lang'

// #538: the designed failure state for every route in the app. Next resolves
// error.tsx up the segment tree, so this one file covers /school, /student,
// /super-admin, /distributor, /agent and /gov and everything beneath them —
// without it, a throw in any server component renders Next's own unstyled
// English fallback, which is the "silent blank screen on a deep link" the UAT
// pass kept hitting.
//
// The thrown message is deliberately not shown. In production Next has already
// replaced it with a digest, and the raw text of a Postgres error names tables
// and columns to whoever is standing at the desk. The digest IS the support
// reference: the same string is in the server log.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useLang()

  useEffect(() => {
    // Server errors are logged server-side; this is the client half, so a
    // failure that only happens in the browser is not invisible.
    console.error(error)
  }, [error])

  return <ErrorState reference={error.digest} onRetry={reset} homeHref="/" lang={lang} />
}
