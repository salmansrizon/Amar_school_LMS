import type { ReactNode } from 'react'
import type { InstitutePrintHeader } from '@/lib/institute-print'

// Shared printable template pieces (ADR 0007) — the legacy C_TAMPLATES
// equivalent. Every printable (receipts, mark sheets, progress reports,
// admit cards, routines, attendance books) composes these; pages pass
// already-translated strings, pieces stay presentation-only.

/** One printed sheet: a card on screen, a bare A4 page in print. Batch
 *  printing renders several PrintPages in a row — each but the last breaks
 *  the page (an unconditional break would print a blank trailing sheet). */
export function PrintPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-190 rounded-md border border-line-strong bg-paper p-8 shadow-card not-last:break-after-page print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {children}
    </div>
  )
}

/** Institute name + meta line + document title (covers the exam-header case:
 *  the docTitle names the exam, e.g. "Mark Sheet — Annual Examination 2025").
 *
 *  Issue #92 deepened this into the full institution block the printing
 *  requirements ask for: pass `institute` (built by `lib/institute-print.ts`)
 *  and the header renders logo, name, address, contacts and codes, centred.
 *  The legacy `name` + `meta` pair still works for printables not yet swept
 *  onto the loader (issue #99); `institute` wins where both are given. */
export function InstituteHeader({
  name,
  meta,
  institute,
  docTitle,
}: {
  name?: string
  meta?: string
  institute?: InstitutePrintHeader
  docTitle: string
}) {
  const heading = institute?.name ?? name ?? ''
  return (
    <header className="mb-4 border-b-2 border-line-strong pb-4 text-center">
      {institute?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={institute.logoUrl}
          alt=""
          className="mx-auto mb-2 h-16 w-auto object-contain"
        />
      ) : null}
      <div className="text-xl font-bold">{heading}</div>
      {institute?.addressLine ? (
        <div className="mt-0.5 text-xs text-muted">{institute.addressLine}</div>
      ) : null}
      {institute?.contactLine ? (
        <div className="mt-0.5 text-xs text-muted">{institute.contactLine}</div>
      ) : null}
      {institute?.codesLine ? (
        <div className="mt-0.5 text-xs text-muted">{institute.codesLine}</div>
      ) : null}
      {!institute && meta ? <div className="mt-0.5 text-xs text-muted">{meta}</div> : null}
      <div className="mt-3 text-lg font-semibold text-brand-600">{docTitle}</div>
    </header>
  )
}

/** A document whose body outruns one sheet: the header lives in a table
 *  header group, which every print engine repeats at the top of each printed
 *  page. Single-sheet printables (admit cards, receipts) keep using
 *  PrintPage + InstituteHeader directly — nothing to repeat there. */
export function PaginatedSheet({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <table className="w-full border-collapse">
      <thead className="table-header-group">
        <tr>
          <th className="p-0 text-left font-normal">{header}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="p-0 align-top">{children}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** Two-column label/value block (student-info, record-info…). */
export function InfoGrid({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between border-b border-dashed border-line pb-0.5">
          <dt className="text-muted">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Right-aligned totals strip under a grade/marks table. */
export function GradePanelRow({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex justify-end gap-6 text-sm font-semibold">{children}</div>
}

/** Signature lines along the sheet's bottom. */
export function SignatureRow({ labels }: { labels: string[] }) {
  return (
    <div className="mt-8 flex justify-between text-xs">
      {labels.map((label) => (
        <span key={label} className="w-40 border-t border-line-strong pt-1 text-center">
          {label}
        </span>
      ))}
    </div>
  )
}

/** A blank fill-in line for paper-fallback templates (issue #39, PRD §5.11) —
 *  same visual language as InfoGrid's value slot, but empty handwriting space
 *  instead of a real value. */
export function BlankLine({ width = 'w-40' }: { width?: string }) {
  return (
    <span className={`inline-block border-b border-dashed border-line-strong align-bottom ${width}`}>
      &nbsp;
    </span>
  )
}

/** A ruled roster table with blank rows — attendance sheets, homework
 *  collection sheets and similar paper-fallback templates (issue #39). */
export function BlankRosterTable({
  columns,
  rowCount = 25,
}: {
  columns: string[]
  rowCount?: number
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} className="border border-line-strong px-2 py-1.5 text-left font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }).map((_, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c} className="border border-line-strong px-2 py-3">
                &nbsp;
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Bottom strip: QR authenticity slot + "powered by" footer. Pass a real
 *  QR as `qr` when the printable has one; the labelled box is the default. */
export function QrFooterRow({
  qrLabel,
  poweredBy,
  qr,
}: {
  qrLabel: string
  poweredBy: string
  qr?: ReactNode
}) {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
      {qr ?? (
        <div className="flex size-21 items-center justify-center rounded-sm border border-dashed border-line-strong text-center text-xs text-muted">
          {qrLabel}
        </div>
      )}
      <div className="text-center text-xs text-muted">{poweredBy}</div>
    </div>
  )
}

/** A rendered QR SVG (web/lib/qr.ts) sized to fill QrFooterRow's default
 * slot — pass as QrFooterRow's `qr` prop wherever a printable has a real
 * authenticity mark instead of the placeholder box (issue #33). */
export function QrMark({ svg }: { svg: string }) {
  return (
    <div
      className="flex size-21 items-center justify-center overflow-hidden rounded-sm border border-line-strong"
      // The SVG string comes from web/lib/qr.ts (the `qrcode` package), never
      // from user input — safe to inject directly.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/** Tone -> pill classes shared by every grade/pass-fail/rating badge across
 *  the printables (mark sheet, progress report) so each template doesn't
 *  repeat the same className string. */
const BADGE_TONES = {
  success: 'bg-mint-soft text-mint-deep',
  info: 'bg-sky-soft text-sky-deep',
  alert: 'bg-alert-soft text-alert-deep',
  warning: 'bg-sun-soft text-sun-deep',
  neutral: 'bg-paper-muted text-muted',
} as const

export function Badge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>{children}</span>
  )
}

/** The admit card's photo slot (mockup's `.photo-box`, issue #48) — a real
 *  photo (student.photo_path, served signed via /api/student-photo) when
 *  set, else the same dashed placeholder box the mockup shows. */
export function PhotoBox({ src, label }: { src?: string | null; label: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- server component; next/image can't sign a per-request URL here.
      <img src={src} alt={label} className="h-30 w-25 shrink-0 rounded-sm border border-line-strong object-cover" />
    )
  }
  return (
    <div className="flex h-30 w-25 shrink-0 items-center justify-center rounded-sm border border-dashed border-line-strong text-center text-xs text-muted">
      {label}
    </div>
  )
}

/** A section heading inside a printed sheet (mockup's `.section-title`) —
 *  e.g. "Behaviour Rating", "Co-curricular Checklist". */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mt-5 mb-2 text-sm font-bold">{children}</div>
}

/** A plain two-column table (label + value per row) — the progress report's
 *  Behaviour Rating table (Criteria/Rating) and similar label/badge listings. */
export function KeyValueTable({
  headers,
  rows,
}: {
  headers: [ReactNode, ReactNode]
  rows: { key: string; label: ReactNode; value: ReactNode }[]
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
          <th className="py-2 pr-2 font-semibold">{headers[0]}</th>
          <th className="py-2 font-semibold">{headers[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-line">
            <td className="py-2 pr-2">{row.label}</td>
            <td className="py-2">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The progress report's co-curricular checklist grid (mockup's
 *  `.cocurricular-grid`) — a checkmark badge per checked item, a dash for
 *  unchecked, three per row. */
export function ChecklistGrid({ items }: { items: { id: string; label: ReactNode; checked: boolean }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 text-sm">
          <Badge tone={item.checked ? 'success' : 'neutral'}>{item.checked ? '✓' : '—'}</Badge>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
