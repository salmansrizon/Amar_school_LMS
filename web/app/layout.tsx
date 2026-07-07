import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Hind_Siliguri } from 'next/font/google'
import { cookies } from 'next/headers'
import { DEFAULT_LANG, LANG_COOKIE, type Lang } from '@/lib/i18n'
import './globals.css'

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
  title: 'Amar School Management',
  description: 'Multi-tenant school management platform',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG
  return (
    <html lang={lang} className={`${jakarta.variable} ${hindSiliguri.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
