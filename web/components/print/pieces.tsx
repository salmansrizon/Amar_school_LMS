import type { ReactNode } from 'react'
import { instituteBandLines, type InstitutePrintHeader } from '@/lib/institute-print'
import { t, type Lang } from '@/lib/i18n'
import { themeStyle, type PrintTheme } from '@/lib/print-themes'

// Shared printable template pieces (ADR 0007) — the legacy C_TAMPLATES
// equivalent. Every printable (receipts, mark sheets, progress reports,
// admit cards, routines, attendance books) composes these; pages pass
// already-translated strings, pieces stay presentation-only.

/** One printed sheet: a card on screen, a bare A4 page in print. Batch
 *  printing renders several PrintPages in a row — each but the last breaks
 *  the page (an unconditional break would print a blank trailing sheet). */
export function PrintPage({
  children,
  theme,
  orientation = 'portrait',
  fill = false,
  className = '',
}: {
  children: ReactNode
  /** Extra classes; PrintFrame names its `@page` rule through this. */
  className?: string
  theme?: PrintTheme
  /** Wide documents (attendance register, seat plan, routine) print on a
   *  landscape A4 sheet via the `@page landscape` rule; the default portrait
   *  keeps the plain `@page`. Only affects print, not the on-screen card. */
  orientation?: 'portrait' | 'landscape'
  /** Full-page single-sheet documents (mark sheet, progress report, result
   *  book, admission form) opt in: in print the sheet becomes a full-height
   *  flex column so a trailing `SignatureRow` (via its `mt-auto`) is pushed to
   *  the foot of the A4 page and the gap above it grows to fill the sheet —
   *  signatures never look cramped under short content. Left off for compact /
   *  multi-up printables (admit cards) that should hug their content. */
  fill?: boolean
}) {
  // A themed sheet (issue #94) paints its own paper and ink from the curated
  // preset; an unthemed one keeps the app's paper token exactly as before.
  const style = theme
    ? { ...themeStyle(theme), background: theme.paper, color: theme.ink }
    : undefined
  return (
    <div
      style={style}
      className={`mx-auto w-full ${orientation === 'landscape' ? 'max-w-280 print-landscape' : 'max-w-190'} rounded-md border border-line-strong p-8 shadow-card not-last:break-after-page print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none${
        fill ? ' print:flex print:min-h-screen print:flex-col' : ''
      }${theme ? '' : ' bg-paper'}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}

/** The frame every A4 document prints in (owner's decision 2026-10-09): one
 *  compact header band and one footer band, the same on every printed page,
 *  with the content flowing between them. Card sheets (admit cards, ID cards)
 *  do not use it.
 *
 *  How it repeats (see the print-doc rules in globals.css): the header band
 *  sits in a `<thead>`, which every engine repeats per page; the `<tfoot>` is
 *  an empty spacer that reserves the footer's room on every page; the footer
 *  band itself rides in the thead cell and is hung one page-height lower, so
 *  it prints at the bottom of each page. On screen both show once, at the top
 *  and the foot of the card. */
export function PrintFrame({
  lang,
  institute,
  docTitle,
  qrSvg,
  orientation = 'portrait',
  fill = false,
  children,
}: {
  lang: Lang
  institute?: InstitutePrintHeader | null
  docTitle: string
  /** From printVerifyQr (lib/print-verify-server.ts); '' prints the labelled box. */
  qrSvg?: string | null
  orientation?: 'portrait' | 'landscape'
  /** One-sheet documents: push a trailing SignatureRow down to the footer. */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <PrintPage orientation={orientation} className={`print-doc-${orientation}-${lang}`}>
      {/* table-fixed pins the single column to the sheet width: an over-wide
          child (the 31-column attendance register) scrolls inside its own
          wrapper instead of stretching the sheet (ui.md issue 1 / #147). */}
      <table className="print-doc w-full table-fixed border-collapse">
        <thead className="table-header-group">
          <tr>
            <th className="p-0 text-left align-top font-normal">
              <div className="print-doc-head">
                <div className="print-band-top flex items-center gap-[3mm] border-b-2 border-line-strong pb-[1mm]">
                  {institute?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={institute.logoUrl} alt="" className="size-[16mm] shrink-0 object-contain" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold">{institute?.name ?? ''}</div>
                    {(institute ? instituteBandLines(institute) : []).map((line) => (
                      <div key={line} className="truncate text-[8pt] text-muted">
                        {line}
                      </div>
                    ))}
                  </div>
                  <div className="line-clamp-3 max-w-[50%] shrink-0 text-right text-sm font-semibold text-brand-600">
                    {docTitle}
                  </div>
                </div>
                <div className="print-band-bottom flex items-center gap-[3mm] border-t border-line">
                  {qrSvg ? (
                    // 20 mm on paper, quiet zone included (the SVG carries its
                    // own 4 modules). It comes from web/lib/qr.ts, never from
                    // user input — safe to inject directly.
                    <div className="size-[20mm] shrink-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  ) : (
                    <div className="flex size-[18mm] shrink-0 items-center justify-center rounded-sm border border-dashed border-line-strong text-center text-[8pt] text-muted">
                      {t('print.qr', lang)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 truncate text-center text-xs text-muted">{t('print.poweredBy', lang)}</div>
                  {/* The page number prints here, from the @page margin box. */}
                  <div className="w-[20mm] shrink-0" />
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td className="p-0">
              <div className="print-doc-foot" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="p-0 align-top">
              <div className={fill ? 'print-doc-fill' : undefined}>{children}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </PrintPage>
  )
}

/** The tall centred letterhead. Card sheets only now (admit cards): every A4
 *  document carries PrintFrame's compact band instead.
 *
 *  Institute name + meta line + document title (covers the exam-header case:
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
  accent,
}: {
  name?: string
  meta?: string
  institute?: InstitutePrintHeader
  docTitle: string
  /** Themed printables (issue #94) tint the rule and the title with their
   *  preset accent; untinted headers keep the brand colour. */
  accent?: string
}) {
  const heading = institute?.name ?? name ?? ''
  return (
    <header
      style={accent ? { borderBottomColor: accent } : undefined}
      className="mb-4 border-b-2 border-line-strong pb-4 text-center"
    >
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
      <div
        style={accent ? { color: accent } : undefined}
        className="mt-3 text-lg font-semibold text-brand-600"
      >
        {docTitle}
      </div>
    </header>
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
  return <div className="print-keep mt-3 flex justify-end gap-6 text-sm font-semibold">{children}</div>
}

/** Signature lines along the sheet's bottom. `print-keep` stops the block from
 *  being split across a page boundary. In print, `mt-auto` inside the sheet's
 *  full-height flex column pushes the signatures to the foot of the A4 page and
 *  lets the gap above them grow to fill whatever vertical space is left — so a
 *  short mark sheet is never cramped and a full one still fits. On screen the
 *  fixed `mt-12` keeps a sensible gap (no flex column there). */
export function SignatureRow({ labels }: { labels: string[] }) {
  return (
    <div className="print-keep mt-12 flex justify-between gap-6 text-xs print:mt-auto">
      {labels.map((label) => (
        <span key={label} className="w-40 border-t border-line-strong pt-2 text-center">
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

/** Bottom strip: verification QR + "powered by" footer. Pass the SVG from
 *  printVerifyQr (lib/print-verify-server.ts) as `qrSvg`; while there is none
 *  (the token column is not there yet) the labelled box stands in. */
export function QrFooterRow({
  qrLabel,
  poweredBy,
  qrSvg,
}: {
  qrLabel: string
  poweredBy: string
  qrSvg?: string | null
}) {
  return (
    <div className="print-keep mt-6 flex items-center justify-between border-t border-line pt-4">
      {qrSvg ? (
        // 112 px = 29.6 mm on paper. The SVG carries its own quiet zone, so no
        // border may sit against it. It comes from web/lib/qr.ts (the `qrcode`
        // package), never from user input — safe to inject directly.
        <div className="size-28 shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      ) : (
        <div className="flex size-21 items-center justify-center rounded-sm border border-dashed border-line-strong text-center text-xs text-muted">
          {qrLabel}
        </div>
      )}
      <div className="text-center text-xs text-muted">{poweredBy}</div>
    </div>
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
  return <div className="mt-5 mb-2 text-sm font-bold break-after-avoid">{children}</div>
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
