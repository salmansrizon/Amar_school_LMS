'use client'

import { useSyncExternalStore } from 'react'
import { DEFAULT_LANG, LANG_COOKIE, type Lang } from '@/lib/i18n'

function read(): Lang {
  const match = document.cookie.match(new RegExp(`${LANG_COOKIE}=(bn|en)`))
  return (match?.[1] as Lang) ?? DEFAULT_LANG
}

// Client-side lang: reads the cookie; LangSwitch's router.refresh() re-renders us.
export function useLang(): Lang {
  return useSyncExternalStore(
    () => () => {},
    read,
    () => DEFAULT_LANG,
  )
}
