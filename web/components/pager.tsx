import Link from 'next/link'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'

// Server-safe URL pager: numbered pages, "showing X–Y of N", and rows-per-page
// links. Every link keeps the other query params (filters, search), so the
// result stays linkable and reload-stable.

export const PAGE_SIZES = [10, 20, 50] as const

/** Page numbers to show, with 'gap' where a run is elided: 1 … 4 5 6 … 20. */
export function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  const keep = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages))
  const sorted = [...keep].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap')
    out.push(n)
  })
  return out
}

/** A ?size= value clamped to the allowed sizes. */
export function pageSizeFrom(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : fallback
}

export function Pager({
  page,
  totalPages,
  total,
  lang,
  params = {},
  pageSize,
  pageParam = 'page',
  sizeParam = 'size',
}: {
  page: number
  totalPages: number
  total: number
  lang: Lang
  params?: Params
  /** When set, shows "showing X–Y of N" and the rows-per-page choice. */
  pageSize?: number
  /** URL keys, for a second table on the same page (e.g. `rpage` / `rsize`). */
  pageParam?: string
  sizeParam?: string
}) {
  const own = pageParam === 'page' ? undefined : pageParam
  const fmt = numberFmt(lang)
  const cell = 'flex items-center justify-center rounded-full px-2 text-sm font-semibold'
  // 44px hit area on a phone; the compact 32px / 28px pills from sm up.
  const pageCell = 'h-11 min-w-11 sm:h-8 sm:min-w-8'
  const sizeCell = 'h-11 min-w-11 text-xs sm:h-7 sm:min-w-7'
  const from = total ? (page - 1) * (pageSize ?? 0) + 1 : 0
  const to = pageSize ? Math.min(total, page * pageSize) : total

  const summary = (
    <span className="text-xs text-muted">
      {pageSize
        ? `${t('pager.showing', lang)} ${fmt.format(from)}–${fmt.format(to)} / ${fmt.format(total)}`
        : `${t('pager.total', lang)}: ${fmt.format(total)}`}
    </span>
  )

  const sizes = pageSize && (
    <span className="flex items-center gap-1 text-xs text-muted">
      {t('pager.perPage', lang)}:
      {PAGE_SIZES.map((n) => (
        <Link
          key={n}
          href={withParams(params, { [sizeParam]: String(n), [pageParam]: null }, own)}
          scroll={false}
          aria-current={n === pageSize ? 'true' : undefined}
          className={`${cell} ${sizeCell} ${n === pageSize ? 'bg-brand-50 text-brand-700' : 'hover:bg-paper-muted'}`}
        >
          {fmt.format(n)}
        </Link>
      ))}
    </span>
  )

  const atFirst = page <= 1
  const atLast = page >= totalPages
  const step = (target: number, label: string, glyph: string, disabled: boolean) => (
    <Link
      href={withParams(params, { [pageParam]: String(target) }, own)}
      scroll={false}
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      className={`${cell} ${pageCell} border border-line-strong ${disabled ? 'pointer-events-none opacity-40' : 'hover:bg-paper-muted'}`}
    >
      <span aria-hidden>{glyph}</span>
    </Link>
  )

  return (
    <nav aria-label={t('pager.label', lang)} className="mt-3 flex flex-wrap items-center justify-between gap-3 px-2">
      <div className="flex flex-wrap items-center gap-4">
        {summary}
        {sizes}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {step(page - 1, t('pager.prev', lang), '‹', atFirst)}
          {pageWindow(page, totalPages).map((n, i) =>
            n === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden>
                …
              </span>
            ) : (
              <Link
                key={n}
                href={withParams(params, { [pageParam]: String(n) }, own)}
                scroll={false}
                aria-current={n === page ? 'page' : undefined}
                className={`${cell} ${pageCell} ${n === page ? 'bg-brand-500 text-white' : 'hover:bg-paper-muted'}`}
              >
                {fmt.format(n)}
              </Link>
            ),
          )}
          {step(page + 1, t('pager.next', lang), '›', atLast)}
        </div>
      )}
    </nav>
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

/** Server paging: clamp a raw ?page= to the real last page once the count is
 *  known, and give the inclusive `.range(from, to)` for it. */
export function pageRange(rawPage: string | undefined, total: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, Math.floor(Number(rawPage)) || 1), totalPages)
  const from = (page - 1) * pageSize
  return { page, totalPages, total, from, to: from + pageSize - 1 }
}
