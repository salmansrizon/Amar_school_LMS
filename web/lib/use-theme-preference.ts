'use client'

import { useSyncExternalStore } from 'react'
import { THEME_COOKIE, parseThemePreference, type ThemePreference } from '@/lib/ui-prefs'

// Client-side theme preference for the handful of pages (auth/public, map
// #370 gate #372's follow-up) that render entirely inside a client boundary
// with no server component in the chain to read the cookie and pass it down
// as a prop, unlike the authenticated shell.
//
// Needs a real subscription, unlike lib/use-lang.ts's identical-looking
// no-op one: router.refresh() (ThemeSwitch's own change handler) reconciles
// from the root server component down, and React can bail out of
// re-rendering an already-mounted client subtree whose own props didn't
// change — which is exactly this case, since AuthCard/ThemeSwitch receive no
// server-computed props at all here. `<html data-theme>` still updates
// correctly (the root layout genuinely re-executes), but the widget's own
// "which button is active" state would silently go stale without this event.
const THEME_CHANGE_EVENT = 'asm-theme-change'

function read(): ThemePreference {
  const match = document.cookie.match(new RegExp(`${THEME_COOKIE}=([a-z]+)`))
  return parseThemePreference(match?.[1])
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange)
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, read, () => 'system')
}

/** Call right after writing the theme cookie, so every mounted
 *  useThemePreference() — not just the one in the component that made the
 *  change — re-reads immediately rather than waiting on router.refresh(). */
export function notifyThemePreferenceChanged(): void {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}
