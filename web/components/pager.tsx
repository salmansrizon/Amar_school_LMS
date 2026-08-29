import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

// Server-safe URL pager for super-admin lists. Emits ?page=N links relative to
// the current path (the list pages carry no other query params), so pagination
// is shareable and reload-stable. Renders just the total when there's one page.
export function Pager({
  page,
  totalPages,
  total,
  lang,
}: {
  page: number
  totalPages: number
  total: number
  lang: Lang
}) {
  const totalLine = (
    <span className="text-xs text-muted">
      {t('pager.total', lang)}: {total}
    </span>
  )
  if (totalPages <= 1) return <div className="mt-3 px-2">{totalLine}</div>

  const cell = 'flex size-8 items-center justify-center rounded-full border border-line-strong text-sm font-semibold'
  const atFirst = page <= 1
  const atLast = page >= totalPages
  return (
    <div className="mt-3 flex items-center justify-between px-2">
      {totalLine}
      <div className="flex items-center gap-1.5">
        <Link
          href={`?page=${page - 1}`}
          aria-label={t('pager.prev', lang)}
          aria-disabled={atFirst}
          className={`${cell} ${atFirst ? 'pointer-events-none opacity-40' : 'hover:bg-paper-muted'}`}
        >
          ←
        </Link>
        <span className="px-2 text-sm font-semibold text-ink">
          {page} / {totalPages}
        </span>
        <Link
          href={`?page=${page + 1}`}
          aria-label={t('pager.next', lang)}
          aria-disabled={atLast}
          className={`${cell} ${atLast ? 'pointer-events-none opacity-40' : 'hover:bg-paper-muted'}`}
        >
          →
        </Link>
      </div>
    </div>
  )
}

/** Clamp a raw ?page= value and slice the rows for that page. Page size lives
 *  with the caller; the helper keeps the off-by-one + clamp in one place. */
export function paginate<T>(rows: T[], rawPage: string | undefined, pageSize: number) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, Number(rawPage) || 1), totalPages)
  const start = (page - 1) * pageSize
  return { page, totalPages, total, items: rows.slice(start, start + pageSize) }
}
