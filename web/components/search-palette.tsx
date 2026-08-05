'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { Icon } from '@/components/school-icons'

// Global-search command palette (#286). Source-agnostic: it filters a list of
// PaletteEntry (label + keywords + href + icon) supplied by the caller, so every
// role feeds its own index — school passes its rich feature index, other roles
// pass their nav sections (AppShell derives those automatically). Shows
// recommendations when empty and navigates to the chosen entry. Keyboard: ↑↓
// move, Enter open, Esc close.

export interface PaletteEntry {
  label: string
  keywords: string[]
  href: string
  icon: React.ReactNode
}

function score(entry: PaletteEntry, query: string): number {
  const label = entry.label.toLowerCase()
  if (label.startsWith(query)) return 3
  if (label.includes(query)) return 2
  if ([label, ...entry.keywords].join(' ').toLowerCase().includes(query)) return 1
  return -1
}

// Rendered only while open (parent mounts/unmounts it), so state starts fresh
// each time and there is no setState-in-effect reset.
export function SearchPalette({
  entries,
  lang,
  onClose,
}: {
  entries: PaletteEntry[]
  lang: Lang
  onClose: () => void
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return entries.slice(0, 6) // recommendations
    return entries
      .map((e) => ({ e, s: score(e, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.e)
  }, [q, entries])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 pt-4 sm:p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('shell.search', lang)}
      onClick={onClose}
    >
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
                  {e.icon}
                </span>
                <span className="truncate">{e.label}</span>
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
