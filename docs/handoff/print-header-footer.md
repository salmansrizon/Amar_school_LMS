# Prints: fixed header and footer bands, watermark, ledger tables, signature room

Owner's decisions of 2026-10-09 (the first brief plus five additions the same
day). Base `26351115` (`merge/staging-sync`). Verified on Chromium 151 with
real pagination (`page.pdf`), PDFs under `.printtest/` (untracked).

## What exists now

- `PrintFrame` (`web/components/print/pieces.tsx`): the one frame every
  document that takes a page prints in. `PrintDocument`
  (`web/components/print/document.tsx`) is the same frame with the verification
  QR built from a `verify` target.
- `PrintWatermark`: the school's own logo behind the content.
- `SignatureRow`: owns its signing room.
- One table rule set in `web/app/globals.css` (`.print-doc table …`).
- Gone: `PaginatedSheet`, `InstituteHeader` (no caller left). `PrintPage`,
  `QrFooterRow`, `PrintVerifyFooter` remain for the ID card sheets.

## Bands

| | size | content |
|---|---|---|
| Header | 24mm + 3mm gap | logo 16mm · name · two small lines · document title (right, up to 3 lines) |
| Footer | 22mm + 3mm gap | QR 20mm · "EdumeBD দ্বারা পরিচালিত" · page number slot |

Both are `overflow: hidden` with a fixed height: long text truncates with an
ellipsis, the band never grows.

Leftover letterhead fields: all of them are on the band's two small lines
(`instituteBandLines`): line 1 = address · mobile · email, line 2 = EIIN ·
institute code · MPO code · centre code. Nothing moved into the content.

### Technique that held

- Header band: real content in the frame table's `<thead>`. Repeats natively.
- Footer room: an empty 25mm `<tfoot>` spacer. Repeats natively, so content
  never reaches the footer's strip.
- Footer band: lives in the thead cell, `position: absolute`, hung at
  `top: calc(100vh - 22mm)`. In print `100vh` is the page content box, so the
  band lands on the bottom edge of every page, portrait or landscape, however
  short the content.
- Watermark: same anchor, centred between the bands.
- Page number: `@page <name> { @bottom-right { content: … counter(page) … } }`
  with `margin-top: -13mm`, which lifts it out of the page margin into the
  band's empty right-hand slot.

### What did not hold

- `position: fixed` bands or watermark: fine for one document, wrong for
  batches. Every student's footer (each with its own QR) would print stacked on
  every page, and the watermark would darken once per document. The
  thead-anchored elements belong to their own table.
- Naming the page on the frame element: a change of page name forces a page
  break, so every print gained a blank trailing sheet. The name now sits on
  `:root:has(.print-doc-…)`.
- Any opaque background over the footer's right slot hides the page number:
  margin boxes paint *under* page content. Print makes every ancestor of the
  frame transparent.
- Wrapper padding (`<main class="p-6">`) pushed page 1's footer 6mm into the
  page margin. Print zeroes padding/margin/border/max-width on every ancestor
  of the frame (`:has(.print-doc)`).
- `transform` / `position: relative` on a margin box: ignored. Only the
  negative margin moves it.
- The toast region (`section[aria-live]`) printed a blank second page on every
  student-portal print (also on the base commit). Hidden on frame pages.

### Page numbers

- Chromium 131+: "পৃষ্ঠা ১ / ৯" (Bangla digits) or "Page 1 / 9", by page
  language. The words live in the four `@page` rules in `globals.css`: margin
  box text can only come from CSS, and the CSP forbids un-nonced inline
  `<style>`. So there are **no new i18n strings**.
- Firefox, Safari: no margin-box support, nothing prints in the slot. Not
  tested in either browser.
- Batches: numbered straight through the batch (card 7 of 13 prints "7 / 13").
  Restarting per student was not attempted: `counter(pages)` is the batch total
  whatever is done to `counter(page)`, so "1 / 13" on every student would be
  worse.
- A tinted admit-card theme hides the page number (see Admit cards).

### QR

20mm printed, quiet zone included (the SVG's own 4 modules). Longest link the
app builds: `exam_attendance_sheet` + token + reference, 112 characters plus the
origin.

| origin length | version | modules incl. quiet zone | module at 20mm |
|---|---|---|---|
| up to 23 | 7 | 53 | 0.377mm |
| 24–53 | 8 | 57 | 0.351mm |
| 54–81 | 9 | 61 | 0.328mm |

`tests/unit/print-verify.test.ts` fails if a 53-character origin tips past
version 8. Not scanned with a phone from paper.

## Watermark

The school's own logo (`institute.logoUrl`, the same signed URL the header band
loads), an `<img>`, grey (`filter: grayscale(1)`), `opacity: 0.06`,
`object-fit: contain`, behind the content (`z-index: -1` inside the frame's
isolated table), `pointer-events: none`, `aria-hidden`.

- Size: 150mm box on portrait, `min(150mm, 100vh - 66mm)` = 120mm on landscape.
- Opacity: 0.05, 0.06 and 0.08 compared on a full ledger page under a dense
  solid stand-in logo. Text, rules and dashes were fully readable at all three
  and hard to tell apart at page scale; 0.06 kept.
- No logo: no `<img>` at all, in the band or as watermark (unit-tested).
- There is no brand fallback anywhere in the print code. The "edumeBD" logo the
  owner saw in a header and as a watermark was a temporary, uncommitted test rig
  of mine (Test School A has no logo, so I pointed `logoUrl` at
  `/images/edumebd-logo.png`, later `/globe.svg`, while the dev server ran). It
  is reverted and was never committed.
- The student log's two panels were opaque white and covered it: they are
  `print:bg-transparent` now. On screen those panels still cover it.

## Admit cards

All three admit card routes print one card to a page: the single card
(`/school/exams/[id]/admit-cards/[studentId]`), the student portal's
(`/student/exams/[examId]/admit-card`) and each card of the batch
(`/school/exams/[id]/print/all?doc=admit-card`). No several-to-a-sheet layout
exists. So all three are frame documents now (bands, watermark, fields in the
content area, signatures at the end). The old in-card QR row and letterhead are
replaced by the bands. Page count unchanged: 13 cards, 13 pages, before and
after.

Theme (issue #94): ink and accent apply as before. A tinted paper is painted on
the frame's table, the one box under the watermark; it also covers the page
number, so a tinted admit card prints none. Classic white is not painted.

ID cards: untouched. Same page counts as base (1 and 69) and pixel-identical
renders on first / middle / last page.

## Tables

One rule set for every table inside a frame, on screen and paper:

- cell border `0.2mm solid #555` (Chromium floors it to 1px = 0.26mm), outer
  frame and header underline `0.55mm solid #333` (2px = 0.53mm),
  `border-collapse: collapse`;
- header: bold, `#f2f2f2` fill, `break-after: avoid`; all other cells
  transparent, so the watermark shows through;
- rows: 10.5pt, padding 1.75mm × 2mm, about 8.9mm a row (the ledger went from
  15 pages to 9);
- pills (`.rounded-full` in a table cell) print as plain text; screen keeps them;
- cell classes for what CSS cannot know: `print-nowrap`, `print-num` (right,
  tabular figures), `print-dash` (centred), `print-total` (bold, top rule),
  `print-table-dense` (8pt, for the 31-day register).

The attendance book is landscape now. In portrait Chromium shrank the whole
page to about 0.68 to fit the 31 columns (so did the base commit), which would
have printed the QR at about 13.7mm. Landscape with the dense table fits at
full size: 14 pages instead of 6 shrunk ones.

## Signatures

`SignatureRow`: 19.0mm clear above each line, 8.0mm clear below the label,
block 33.6mm tall, `break-inside: avoid` (measured under print media). On a
short sheet it rests above the footer band; when it does not fit it moves to
the next page whole (checked by inserting a 135mm filler in the browser). No
print route draws its own signature lines.

## Wired

Mark sheet (3 templates), progress report (3), admission form, fee receipt,
class routine, exam routine, attendance book, student attendance log, general
ledger, exam attendance sheet, seat plan, the five blank templates, print-all
batches (mark sheet, progress report, admit card), admit card (single, batch,
student portal), student portal fee statement, routine and mark sheet.

Not wired: ID card and ID card sheet (by decision).

## Not verified

- Exam attendance sheet and seat plan with real rows: no exam in the test
  school has a seat plan. Both render the frame; only the empty state was
  printed.
- The preview popup: its on-screen preview was checked and its frame document
  was printed on its own (2 pages, bands on both). `contentWindow.print()`
  itself cannot be captured headless.
- Firefox and Safari.
- A real school logo: the watermark and band logo were rendered with stand-in
  images only.
- QR scanning from paper.
- e2e specs were not run. Two of them describe the old wrapper table in
  comments (`school.attendance.student-log.spec.ts`,
  `school.class-section-select.spec.ts`).

## Left for later

- `PrintPage`'s `fill` prop and the `print-landscape` class / `@page landscape`
  rule have no user left outside the frame.
- Fee receipt: `<main>` went from `max-w-md` to `max-w-3xl` so the bands span
  the sheet; the receipt keeps its narrow column inside.
- Ledger: the date range moved from a line under the letterhead into the
  document title, so it still repeats on every page.

## Page budget (owner, 2026-10-09: "page should not increase pages count")

Rule: for the same data no document prints on more pages than on base
`26351115`. Same URL rendered with `page.pdf()` on a base checkout (port 3795)
and on the current tree (port 3791), `.printtest/budget.mjs`. "Synthetic" rows
repeat the last table row in the browser, identically on both sides.

### Step 1 — measured before any tightening

| Document | Base pages | After the frame | |
|---|---|---|---|
| mark sheet t1 / t2 / t3 | 2 | 1 | fewer |
| mark sheet t1, t2 with 14 subjects (synthetic) | 2 | 1 | fewer |
| progress report t1 / t2 / t3 | 2 | 1 | fewer |
| progress report t3 with 14 subjects (synthetic) | 2 | 1 | fewer |
| admission form | 2 | 1 | fewer |
| fee receipt | 1 | 1 | same |
| class routine | 2 | 1 | fewer |
| exam routine | 1 | 1 | same |
| attendance book (filled and blank mode) | 6 | 14 | **more** |
| student log | 2 | 2 | same |
| general ledger | 14 | 9 | fewer |
| exam attendance sheet (empty: no seat plan in test data) | 1 | 1 | same |
| seat plan (empty state) | 2 | 1 | fewer |
| template admission | 2 | 1 | fewer |
| template attendance | 2 | 2 | same |
| template exam answer | 2 | 2 | same |
| template homework | 2 | 1 | fewer |
| template lesson plan | 1 | 1 | same |
| print-all mark sheets (13 students) | 15 | 13 | fewer |
| print-all progress reports (13 students) | 15 | 13 | fewer |
| admit cards batch (13) | 13 | 13 | same |
| admit card single | 1 | 1 | same |
| student fee statement | 2 | 1 | fewer |
| student routine | 2 | 1 | fewer |
| student mark sheet | 1 | 1 | same |
| ID card / ID card sheet (not framed) | 1 / 69 | 1 / 69 | same |

Most of base's second pages were a blank trailing sheet (the old full-height
sheet plus the wrapper's padding). Only the attendance book grew: base printed
it portrait with the browser shrinking the whole page to about 0.68, so its
12px text reached the paper at about 6pt.

### Step 2 — attendance book

277 students in the default (all classes) view.

| | pages | text on paper | rows a page |
|---|---|---|---|
| Base (portrait, page shrunk to ~0.68 by the browser) | 6 | about 6pt | about 46 |
| After the frame, before this pass (landscape, 8pt) | 14 | 8pt | about 20 |
| Now (landscape, unscaled) | **8** | 9pt | 36 |

Tightened: 9pt on `line-height: 1`, cell padding 0.2mm × 0.6mm (row 4.1mm),
day columns 4.85mm, the name column capped at 62mm with an ellipsis, legend at
8.5pt with a 1mm gap, landscape page margins 12mm → 8mm top/bottom and 10mm
sides (all landscape frame documents). Bands and QR are full size; the page is
not scaled. There is no totals column in this register, before or now.

**Still over base: 8 pages against 6.** It cannot reach 6 in landscape above
the 8.5pt floor: six landscape sheets have about 142mm × 6 = 852mm for 277
rows, 3.1mm a row, which is 7pt text at most. Base only fit 6 because it
printed at about 6pt. Measured alternative: the same dense table in
**portrait prints on 5 pages** at 9pt (one fewer than base); I did not inspect
that render for scaling or name truncation, and the owner's decision is
landscape, so it is not applied. A single class of 40–70 students is 2 pages
either way.

### Step 3 — everything else

Nothing else exceeds base, so no other layout was tightened. Band small lines
and the page number went from 8pt to 8.5pt so no printed text is under the
floor. Smallest text now: 8.5pt (band small lines, page number, register
legend); the register is 9pt; other tables are 10.5pt.

Final counts are the Step 1 table with the attendance book at 8. Last page of
each batch carries a student (13 of 13), no blank sheet.
