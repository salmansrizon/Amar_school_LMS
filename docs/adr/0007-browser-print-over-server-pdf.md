# 0007 — Browser-native print, no server-side PDF renderer

## Status
Accepted (2026-07-09)

## Context
Nearly every PRD module ends in a print-preview → print/PDF flow (receipts, mark sheets ×3,
progress reports ×3, admit cards, ID cards, routines, attendance books, admission forms).
The Architecture doc left the renderer open: headless Chromium vs React-PDF, hosted on
Vercel's free tier. The legacy app shared one template layer (`C_TAMPLATES`: institute
header, exam header, student-info block, grade panel, "powered by" footer) across all
printables.

Three facts settled it:

1. **Bangla is the primary script.** Bengali needs full complex-text shaping (conjuncts,
   reph, vowel reordering). The browser's own text engine (HarfBuzz) does this perfectly;
   `@react-pdf/renderer`'s fontkit shaping of Bengali is unreliable. Headless Chromium
   shapes correctly but only by shipping a ~50 MB browser into a serverless function.
2. **No PRD flow needs a PDF *file*.** Every printable is a preview the user prints or
   saves as PDF from the browser dialog. Nothing is emailed, stored, or attached
   server-side (syllabus PDFs are uploads, not generated). Server rendering would produce
   bytes nobody consumes except via that same print dialog.
3. **The MVP already prints this way.** The fee receipt (`/school/fees/receipt/[id]`) is a
   server-rendered page with `print:` Tailwind variants and a `window.print()` button —
   shipped and accepted.

## Decision
Printables are ordinary server-rendered pages styled with Tailwind, printed with
`window.print()`:

- A shared template layer in `web/components/print/` (the `C_TAMPLATES` equivalent):
  `PrintPage` (A4-shaped sheet, screen card / print page), `InstituteHeader` (institute
  name + meta + document title, covering the exam-header case), `InfoGrid` (student/record
  info block), `SignatureRow`, `QrFooterRow` (QR slot + "powered by" footer), and a shared
  `PrintButton`. Every later printable composes these.
- Print behavior via CSS only: `@page { size: A4 }` plus `print:` utilities that hide app
  chrome and strip the screen card frame. Batch "print all" renders N `PrintPage`s
  (each `break-after: page`) and calls `window.print()` once.
- No PDF dependency is added. Zero serverless weight, zero cold-start cost, nothing to
  outgrow the Vercel free tier.

## Consequences
- Pixel output varies slightly by browser/OS print engine — acceptable; the legacy Swing
  print preview had the same property per JVM/printer.
- If a fast-follow ever needs a true server-side PDF file (e.g. attach to email), the seam
  already fits: point headless Chromium (e.g. `@sparticuz/chromium` or a browserless
  service) at the existing print route and capture `page.pdf()` — templates need no change.
- ID cards and other non-A4 stock use their own `@page` size on that route; same pattern.
