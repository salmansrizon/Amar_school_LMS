'use client'

import { useRouter } from 'next/navigation'
import { LANG_COOKIE, type Lang } from '@/lib/i18n'

function writeLangCookie(next: Lang) {
  document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000`
}

export function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter()
  const set = (next: Lang) => {
    writeLangCookie(next)
    router.refresh()
  }
  const btn = (value: Lang, label: string) => (
    <button
      type="button"
      onClick={() => set(value)}
      className={`px-3 py-1 text-xs cursor-pointer ${
        lang === value ? 'bg-brand-500 text-white' : 'bg-paper text-muted'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-line">
      {btn('bn', 'বাং')}
      {btn('en', 'EN')}
    </div>
  )
}
