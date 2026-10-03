import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

/** Title + back link, the same header every Attendance page carries. */
export function MachinePageHeader({ title, lang }: { title: string; lang: Lang }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <Link
        href="/school"
        aria-label={t('common.back', lang)}
        className="inline-flex size-9 max-sm:size-11 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
    </div>
  )
}
