import Link from 'next/link'
import type { ReactNode } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Card } from '@/components/ui/page'
import { Pager } from '@/components/pager'
import { DataTableFilters, type FilterDef } from './filters'
import { BulkBar, RowCheck, SelectAll, SelectionProvider, type BulkAction } from './selection'
import { RowMenu, type RowMenuItem } from './row-menu'
import { DataTableShortcuts } from './shortcuts'

// The one table every School Owner record list uses (map 013, F2).
// Server component: rows are filtered, sorted and paginated by the page before
// they get here; state lives in the URL. Client islands: filters, selection,
// row menu. Phone and desktop are two DOMs from one column list — CSS shows
// one — so both stay semantic (a real <table> and a real <ul>).

export type Column<T> = {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** How the column shows on the phone card. Default `meta`. */
  card?: 'title' | 'badge' | 'meta' | 'hidden'
  align?: 'right'
  className?: string
}

export type Chip = { param: string; value: string; label: string }

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  mint: 'bg-mint-soft text-mint-deep',
  sun: 'bg-sun-soft text-sun-deep',
  alert: 'bg-alert-soft text-alert-deep',
  sky: 'bg-sky-soft text-sky-deep',
  muted: 'bg-paper-muted text-muted',
} as const

/** Status pill. Always carries text, so colour is never the only signal.
 * `pulse` and `live` are motion, on top of that text, never instead of it —
 * both reuse Tailwind's built-in keyframes (no new CSS) and both are
 * `motion-safe:`, so a reduced-motion user gets the same pill with no
 * animation at all (the app-wide prefers-reduced-motion override in
 * globals.css also neutralises them as a second safety net). */
export function Pill({
  tone,
  pulse,
  live,
  children,
}: {
  tone: keyof typeof TONES
  /** "Needs attention now" — e.g. exam setup incomplete, fee due, staff not
   *  checked in, no access granted. A soft opacity pulse on the pill itself,
   *  the same idiom as the dashboard checklist's due badge. Never apply this
   *  to a steady-state fact (closed, paid, present) — a screen full of
   *  pulsing pills is noise, not engagement. */
  pulse?: boolean
  /** "Open / running" — a small live dot ahead of the label, the standard
   *  online-indicator shape. */
  live?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${
        pulse ? 'motion-safe:animate-pulse' : ''
      }`}
    >
      {live && (
        <span className="relative mr-1.5 flex size-1.5 shrink-0" aria-hidden="true">
          <span className="absolute h-full w-full rounded-full bg-current opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}

export function DataTable<T>({
  rows,
  rowId,
  rowLabel,
  columns,
  lang,
  params,
  caption,
  search,
  filters = [],
  chips = [],
  bulkActions = [],
  rowActions,
  rowMenu,
  pagination,
  empty,
}: {
  rows: T[]
  rowId: (row: T) => string
  /** Accessible name for the row's checkbox and menu, e.g. the student's name. */
  rowLabel: (row: T) => string
  columns: Column<T>[]
  lang: Lang
  /** The page's resolved searchParams. */
  params: Params
  /** Screen-reader caption for the table. */
  caption: string
  search?: { param?: string; placeholder: string }
  filters?: FilterDef[]
  chips?: Chip[]
  bulkActions?: BulkAction[]
  /** Inline buttons at the row's end, e.g. the Profile (drawer) button. */
  rowActions?: (row: T) => ReactNode
  rowMenu?: (row: T) => RowMenuItem[]
  pagination?: { page: number; totalPages: number; total: number; pageSize?: number }
  /** Rendered in place of the table when `rows` is empty. */
  empty: ReactNode
}) {
  const selectable = bulkActions.length > 0
  const shortcuts = <DataTableShortcuts lang={lang} />
  const hasActions = Boolean(rowActions || rowMenu)
  const filterParams = [search?.param ?? 'q', ...filters.map((f) => f.param), ...chips.map((c) => c.param)]
  const filtered = filterParams.some((p) => params[p])
  const reset = withParams(params, Object.fromEntries(filterParams.map((p) => [p, null])))

  const toolbar = (search || filters.length > 0 || chips.length > 0) && (
    <Card className="mb-grid">
      <DataTableFilters search={search} filters={filters} lang={lang} />
      {(chips.length > 0 || filtered) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {chips.length > 0 && <span className="text-xs text-muted">{t('table.quickFilters', lang)}:</span>}
          {chips.map((c) => {
            const active = params[c.param] === c.value
            return (
              <Link
                key={`${c.param}=${c.value}`}
                href={withParams(params, { [c.param]: active ? null : c.value })}
                aria-current={active ? 'true' : undefined}
                scroll={false}
                className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition ${
                  active ? 'bg-brand-500 text-white' : 'bg-paper-muted text-ink hover:bg-line'
                }`}
              >
                {c.label}
              </Link>
            )
          })}
          {filtered && (
            <Link href={reset} scroll={false} className="ml-auto text-xs font-semibold text-muted hover:text-ink">
              <span aria-hidden>↺</span> {t('table.resetFilters', lang)}
            </Link>
          )}
        </div>
      )}
    </Card>
  )

  if (!rows.length) {
    return (
      <>
        {toolbar}
        {empty}
        {shortcuts}
      </>
    )
  }

  const titleCols = columns.filter((c) => c.card === 'title')
  const badgeCols = columns.filter((c) => c.card === 'badge')
  const metaCols = columns.filter((c) => !c.card || c.card === 'meta')
  const actionsFor = (row: T) =>
    hasActions && (
      <div className="flex items-center justify-end gap-1">
        {rowActions?.(row)}
        {rowMenu && <RowMenu items={rowMenu(row)} label={`${t('table.more', lang)}: ${rowLabel(row)}`} />}
      </div>
    )

  const body = (
    <>
      {selectable && <BulkBar actions={bulkActions} lang={lang} />}
      <Card padded={false} className="overflow-hidden">
        {/* Phone: cards. */}
        <ul className="divide-y divide-line md:hidden">
          {rows.map((row) => (
            <li key={rowId(row)} className="flex gap-3 p-card">
              {selectable && (
                <div className="pt-1">
                  <RowCheck id={rowId(row)} label={`${t('table.selectRow', lang)}: ${rowLabel(row)}`} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {titleCols.map((c) => (
                      <div key={c.key}>{c.cell(row)}</div>
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {badgeCols.map((c) => (
                      <span key={c.key}>{c.cell(row)}</span>
                    ))}
                  </div>
                </div>
                {metaCols.length > 0 && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {metaCols.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-muted">{c.header}</dt>
                        <dd className="truncate">{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {hasActions && <div className="mt-3">{actionsFor(row)}</div>}
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop: table. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-paper-muted">
              <tr>
                {selectable && (
                  <th scope="col" className="w-10 px-4 py-3">
                    <SelectAll lang={lang} />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-sm font-semibold text-muted ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.header}
                  </th>
                ))}
                {hasActions && (
                  <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-muted">
                    {t('table.actions', lang)}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={rowId(row)} className="transition hover:bg-paper-muted/60">
                  {selectable && (
                    <td className="px-4 py-3">
                      <RowCheck id={rowId(row)} label={`${t('table.selectRow', lang)}: ${rowLabel(row)}`} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 align-middle ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {hasActions && <td className="px-4 py-3">{actionsFor(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="border-t border-line px-2 pb-3">
            <Pager {...pagination} lang={lang} params={params} />
          </div>
        )}
      </Card>
    </>
  )

  return (
    <>
      {toolbar}
      {selectable ? <SelectionProvider ids={rows.map(rowId)}>{body}</SelectionProvider> : body}
      {shortcuts}
    </>
  )
}
