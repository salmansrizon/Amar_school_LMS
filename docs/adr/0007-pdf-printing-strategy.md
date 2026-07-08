# ADR 0007 — PDF & printing strategy

- Status: Accepted
- Date: 2026-07-08
- Relates to: PRD §5.5 / §5.6 / §7 (Printing), Architecture §5 (PDF/printing), issue #25

## Context

Nearly every module ends in a print-preview → print/PDF flow: fee receipts,
mark sheets (×3 variants), progress reports (×3), admit cards (×2), ID cards,
attendance books, class/exam routines, admission forms. The legacy Swing app
rendered these through a shared `C_TAMPLATES` component (institute header, exam
header, student-info block, grade panel, "powered by" footer as composable
pieces). We need one PDF strategy that every later printable builds on, and it
must run on the **Vercel Hobby (free) tier** (Architecture §8, phase 1).

Two candidate renderers, as framed by the ticket:

1. **Headless Chromium** (Puppeteer + `@sparticuz/chromium`): render an HTML/CSS
   template to PDF. Maximum layout fidelity, reuses web CSS.
2. **`@react-pdf/renderer`**: build the document as React components; a pure-JS
   engine (fontkit + a PDF primitive layer, no browser) emits the PDF.

## Decision

Use **`@react-pdf/renderer`** as the single PDF engine, with a shared template
layer of composable pieces mirroring the legacy `C_TAMPLATES` pattern.

### Why not headless Chromium

- **Free-tier size limit.** A Hobby serverless function is capped at 250 MB
  unzipped; the `@sparticuz/chromium` binary alone is ~50 MB and, bundled with
  Puppeteer, routinely pushes cold-start time and bundle size to the edge of
  what Hobby tolerates. `@react-pdf/renderer` adds no binary — it is plain JS
  that traces cleanly.
- **Cold starts.** Booting Chromium per invocation costs seconds; the React-PDF
  path renders our sample A4 mark sheet in a few hundred milliseconds.
- **No system dependencies** to keep patched.

### Cost of the choice (accepted)

- React-PDF does **not** interpret arbitrary HTML/CSS — templates are authored
  against its own flexbox subset and `StyleSheet` API. Our printables are
  structured documents (headers, tables, panels), which is exactly its sweet
  spot, so this is not a real constraint here.
- Bengali text needs an embedded font: react-pdf ships only Helvetica/Times/
  Courier (no Bengali glyphs). We register **Hind Siliguri** (the Family design
  system's Bangla face, ADR 0006), bundled in `web/lib/pdf/fonts/`. Verified: it
  embeds as subsetted CIDFontType2 and Bangla renders correctly.

## Consequences / the seam

The prototype (issue #25) lands the reusable layer every later printable extends:

- `web/lib/pdf/register-fonts.ts` — one-time Hind Siliguri registration + Bengali
  hyphenation guard.
- `web/lib/pdf/theme.ts` — Family design tokens mirrored for the PDF surface.
- `web/lib/pdf/templates/pieces.tsx` — the composable `C_TAMPLATES` equivalents:
  `InstituteHeader`, `ExamHeader`, `StudentInfoBlock`, `GradePanel`,
  `PoweredByFooter`.
- `web/lib/pdf/render.ts` — the single `renderPdf()` choke point (registers fonts,
  renders to bytes). **Node serverless runtime only — never Edge** (react-pdf
  needs Node stream internals); print routes set `export const runtime = "nodejs"`.
- Prototype printable: `web/lib/pdf/templates/mark-sheet.tsx` (+ `sample-data.ts`),
  served by `web/app/api/print/mark-sheet/route.tsx` (`?lang=bn|en`, `?download=1`,
  else the app language cookie) and linked from the Exams screen.

The MVP fee receipt (`app/school/fees/receipt/[id]`) stays on browser CSS print
(`window.print()`) — fine for a one-off inline document. This ADR is the seam for
the *heavier* printables (mark sheets ×3, progress reports ×3, admit cards, ID
cards, routines, attendance books) that need server-rendered, downloadable PDFs.

Bilingual labels (ADR 0004) are passed into the pieces so a single template
renders bn or en. Later §5.5/§5.6 printables (progress reports, admit cards,
batch print) compose the same pieces rather than starting from scratch.
