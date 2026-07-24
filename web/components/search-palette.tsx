'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { canOpenScreen, type ScreenKey } from '@/lib/auth/screens'
import { SCHOOL_SEARCH, type SearchEntry } from '@/lib/school-search'
import { Icon } from '@/components/school-icons'
import type { Role } from '@/lib/auth/routing'

// Global-search command palette. Filters the feature index (SCHOOL_SEARCH) by
// keyword match in the active language, shows recommendations when empty, and
// navigates straight to the chosen feature. Keyboard: ↑↓ move, Enter open, Esc close.

function score(entry: SearchEntry, query: string, lang: Lang): number {
  const label = t(entry.titleKey, lang).toLowerCase()
  if (label.startsWith(query)) return 3
  if (label.includes(query)) return 2
  if ([label, ...entry.keywords].join(' ').toLowerCase().includes(query)) return 1
  return -1
}

// Rendered only while open (parent mounts/unmounts it), so state starts fresh
// each time and there is no setState-in-effect reset.
export function SearchPalette({
  role,
  grants,
  lang,
  onClose,
}: {
  role: Role
  grants: readonly string[]
  lang: Lang
  onClose: () => void
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const available = useMemo(
    () => SCHOOL_SEARCH.filter((e) => e.screen === 'dashboard' || canOpenScreen(role, grants, e.screen as ScreenKey)),
    [role, grants],
  )

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return available.slice(0, 6) // recommendations
    return available
      .map((e) => ({ e, s: score(e, query, lang) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.e)
  }, [q, available, lang])

  // Focus the input on mount (DOM side effect only — no setState).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    // On phones the palette sits just below the top edge instead of 12vh down:
    // the on-screen keyboard eats the lower half of the viewport, so a tall top
    // offset pushed the input and results out of reach (issue #118).
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 pt-4 sm:p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('shell.search', lang)}
      onClick={onClose}
    >
      {/* Height is capped to the *visible* viewport (dvh) and the panel is a
          flex column, so the input and hint stay pinned while only the results
          scroll — however little room the keyboard leaves. */}
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-xl sm:max-h-[76dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="size-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const r = results[active]
                if (r) go(r.href)
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
            placeholder={t('shell.search', lang)}
            aria-label={t('shell.search', lang)}
            className="w-full bg-transparent py-3.5 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        {!q.trim() && (
          <div className="shrink-0 px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('search.suggested', lang)}</div>
        )}

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('search.noResults', lang)}</li>}
          {results.map((e, i) => (
            <li key={e.href}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(e.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  i === active ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-brand-50/60'
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon name={e.screen} className="size-4" />
                </span>
                <span className="truncate">{t(e.titleKey, lang)}</span>
                <Icon name="chevronRight" className="ml-auto size-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>

        <div className="shrink-0 border-t border-line px-4 py-2 text-xs text-muted">{t('search.hint', lang)}</div>
      </div>
    </div>
  )
}
