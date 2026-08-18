import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Hind_Siliguri } from 'next/font/google'
import { cookies } from 'next/headers'
import { DEFAULT_LANG, LANG_COOKIE, type Lang } from '@/lib/i18n'
import { THEME_COOKIE, parseThemePreference, themeAttribute } from '@/lib/ui-prefs'
import './globals.css'

// `shadcn init` adds a Geist face here bound to `--font-sans`, which silently
// replaces the whole stack: Bangla is the primary script (ADR 0004) and Geist has
// no Bengali subset, so Hind Siliguri would drop out app-wide. The faces are fixed
// by ADR 0004/0006 — only the type scale moves. Do not reintroduce it.

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const hindSiliguri = Hind_Siliguri({
  variable: '--font-bangla',
  subsets: ['bengali', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'EdumeBD',
  description: 'Multi-tenant school management platform',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG
  // Stamped from the cookie so the first paint is already the right theme. An
  // explicit light/dark choice sets the attribute; "system" sets nothing and lets
  // `prefers-color-scheme` decide, which is why no blocking script is needed here
  // (map #370, lib/ui-prefs.ts).
  const theme = themeAttribute(parseThemePreference(cookieStore.get(THEME_COOKIE)?.value))
  return (
    <html
      lang={lang}
      data-theme={theme}
      className={`${jakarta.variable} ${hindSiliguri.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
