// Dependency-free dashboard charts for the super-admin landing (map #171, T3).
// web/ carries no charting library, so these are plain CSS/SVG and server-safe
// (no 'use client'). Both are presentational — data shaping lives in T2's
// lib/super-admin/financials.ts, whose IncomeBucket is the single owner of the
// trend point shape.

import type { IncomeBucket } from '@/lib/super-admin/financials'

/** A simple income bar trend. Bars are CSS-height columns (no SVG needed), each
 *  scaled to the series max; a flat-zero series still renders baseline stubs.
 *  `formatValue` renders the hover title (e.g. taka formatting). */
export function BarTrend({
  data,
  formatValue,
}: {
  data: IncomeBucket[]
  formatValue: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2">
      {data.map((d) => {
        const pct = Math.round((d.total / max) * 100)
        return (
          <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end" title={`${d.month}: ${formatValue(d.total)}`}>
              <div
                className="w-full rounded-t-md bg-brand-500/85 transition-[height]"
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="truncate text-[10px] font-semibold text-muted">{d.month.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

export interface DonutSegment {
  label: string
  value: number
  /** Tailwind text-color class; the arc is stroked with currentColor. */
  colorClass: string
}

const R = 54
const C = 2 * Math.PI * R

/** A status donut: one stroked arc per segment, sized by share of the total, laid
 *  out clockwise from 12 o'clock. Centre shows the total. An all-zero total draws
 *  an empty track. */
export function StatusDonut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[]
  centerValue: number
  centerLabel: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  // Prefix-sum the arc start offsets up front, so the render map is a pure
  // lookup rather than a running mutation.
  const arcLengths = segments.map((s) => (total > 0 ? (s.value / total) * C : 0))
  const arcStarts = arcLengths.reduce<number[]>((acc, len, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + arcLengths[i - 1])
    return acc
  }, [])
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <svg viewBox="0 0 128 128" className="size-36 shrink-0 -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth="14" className="text-line/60" />
        {total > 0 &&
          segments.map((s, i) => (
            <circle
              key={s.label}
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="14"
              strokeDasharray={`${arcLengths[i]} ${C - arcLengths[i]}`}
              strokeDashoffset={-arcStarts[i]}
              className={s.colorClass}
            />
          ))}
      </svg>
      <div className="min-w-0">
        <div className="mb-2 leading-tight">
          <div className="text-2xl font-extrabold text-ink">{centerValue}</div>
          <div className="text-xs font-medium text-muted">{centerLabel}</div>
        </div>
        <ul className="flex flex-col gap-1.5">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              <span className={`size-2.5 shrink-0 rounded-full bg-current ${s.colorClass}`} aria-hidden="true" />
              <span className="text-muted">{s.label}</span>
              <span className="ml-auto font-bold text-ink">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
