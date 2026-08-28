'use client'

import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { themeCookieAssignment, type ThemePreference } from '@/lib/ui-prefs'
import { notifyThemePreferenceChanged } from '@/lib/use-theme-preference'

// Theme control (map #370), sat beside LangSwitch because both are the same kind
// of thing: a deliberate preference persisted in a cookie so the server renders
// the chosen state on first paint rather than correcting it after hydration.
//
// `router.refresh()` rather than a client-side class flip: the attribute lives on
// <html>, which the root layout owns, so re-rendering from the server is what
// actually applies the choice — and it keeps the cookie the single source of truth.

const OPTIONS: { value: ThemePreference; icon: React.ReactNode; labelKey: 'theme.light' | 'theme.dark' | 'theme.system' }[] = [
  {
    value: 'light',
    labelKey: 'theme.light',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: 'dark',
    labelKey: 'theme.dark',
    icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  },
  {
    value: 'system',
    labelKey: 'theme.system',
    icon: (
      <>
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
]

// Module scope, matching writeLangCookie in lang-switch.tsx: assigning to
// document.cookie inside the component reads as mutating a value the compiler
// tracks (react-hooks/immutability), and this is a side effect on the document
// rather than component state.
function writeThemeCookie(next: ThemePreference) {
  document.cookie = themeCookieAssignment(next)
  notifyThemePreferenceChanged()
}

export function ThemeSwitch({ preference, lang }: { preference: ThemePreference; lang: Lang }) {
  const router = useRouter()

  const set = (next: ThemePreference) => {
    writeThemeCookie(next)
    router.refresh()
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label', lang)}
      className="inline-flex overflow-hidden rounded-full border border-line"
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value
        const label = t(option.labelKey, lang)
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => set(option.value)}
            className={`min-h-11 cursor-pointer px-2.5 py-1 transition sm:min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              active ? 'bg-brand-500 text-white' : 'bg-paper text-muted hover:text-ink'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              {option.icon}
            </svg>
          </button>
        )
      })}
    </div>
  )
}
