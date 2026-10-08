'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { SHORTCUTS_COOKIE, parseShortcutsEnabled, shortcutsCookieAssignment } from '@/lib/ui-prefs'

// DataTable single-key shortcuts (map 013, F6): `/` search, `F` first filter.
// Esc is base-ui's job (the drawer closes itself). WCAG 2.1.4: printable-key
// shortcuts need an off switch, so the hint bar carries one, persisted in a
// cookie like the theme and read client-side (see useShortcutsEnabled below)
// so DataTable itself never needs a server-only cookie API.

export type ShortcutKeyEvent = {
  key: string
  keyCode?: number
  isComposing?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  target?: EventTarget | { tagName?: string; isContentEditable?: boolean } | null
}

export type ShortcutAction = 'search' | 'filter'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Which shortcut this key press is, or null to leave it alone. Pure, so tested. */
export function shouldHandleShortcut(
  e: ShortcutKeyEvent,
  prefs: { enabled: boolean; dialogOpen?: boolean },
): ShortcutAction | null {
  if (!prefs.enabled || prefs.dialogOpen) return null
  // keyCode 229: IME keydown that can arrive before compositionstart (Bangla IMEs).
  if (e.isComposing || e.keyCode === 229) return null
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null | undefined
  if (target && (EDITABLE.has(target.tagName ?? '') || target.isContentEditable)) return null
  if (e.key === '/') return 'search'
  if (e.key === 'f' || e.key === 'F') return 'filter'
  return null
}

const TARGET: Record<ShortcutAction, string> = { search: 'data-table-search', filter: 'data-table-filter' }
const OPEN_OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

// DataTable itself must stay isomorphic (server or client caller), so the
// preference can no longer be read server-side and passed down as a prop
// (map 013 follow-up: a client caller's import graph can't include a
// server-only cookie API at all). Read it here instead, the same
// useSyncExternalStore + cookie-change-event shape as use-theme-preference.ts.
const SHORTCUTS_CHANGE_EVENT = 'asm-shortcuts-change'

function readShortcutsEnabled(): boolean {
  const match = document.cookie.match(new RegExp(`${SHORTCUTS_COOKIE}=([01])`))
  return parseShortcutsEnabled(match?.[1])
}

function subscribeShortcutsEnabled(onChange: () => void): () => void {
  window.addEventListener(SHORTCUTS_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(SHORTCUTS_CHANGE_EVENT, onChange)
}

// ponytail: getServerSnapshot fixes "on" (the documented default) since there's
// no request to read a cookie from during SSR; a user who turned shortcuts off
// sees the hint bar for one frame before this hook re-reads on mount.
function getServerSnapshot(): boolean {
  return true
}

function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribeShortcutsEnabled, readShortcutsEnabled, getServerSnapshot)
}

// Module scope, like writeThemeCookie: a document side effect, not component state.
function writeShortcutsCookie(enabled: boolean) {
  document.cookie = shortcutsCookieAssignment(enabled)
  window.dispatchEvent(new Event(SHORTCUTS_CHANGE_EVENT))
}

const KBD = 'inline-flex min-w-6 justify-center rounded-sm border border-line-strong bg-paper px-1.5 py-0.5 text-xs font-semibold text-ink'

/** Mounted once per DataTable: the key listener plus the hint bar with its on/off switch. */
export function DataTableShortcuts({ lang }: { lang: Lang }) {
  const enabled = useShortcutsEnabled()

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector(OPEN_OVERLAY))
      const action = shouldHandleShortcut(e, { enabled, dialogOpen })
      if (!action) return
      const el = document.getElementById(TARGET[action])
      if (!el) return
      e.preventDefault()
      el.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])

  const toggle = () => {
    writeShortcutsCookie(!enabled)
  }

  return (
    <div className="mt-grid hidden flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-paper px-card py-3 text-sm text-muted md:flex">
      {enabled && (
        <>
          <span className="inline-flex items-center gap-2">
            <kbd className={KBD}>F</kbd> {t('table.shortcutFilters', lang)}
          </span>
          <span className="inline-flex items-center gap-2">
            <kbd className={KBD}>/</kbd> {t('table.shortcutSearch', lang)}
          </span>
        </>
      )}
      <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs">
        {t('table.shortcuts', lang)}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          className={`relative h-5 w-9 cursor-pointer rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
            enabled ? 'bg-brand-500' : 'bg-line-strong'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 size-4 rounded-full bg-paper shadow-sm transition-[left] ${enabled ? 'left-[1.125rem]' : 'left-0.5'}`}
          />
        </button>
      </label>
    </div>
  )
}
