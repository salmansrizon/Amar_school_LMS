# A4 prints: fixed header and footer bands on every page

Owner's decisions of 2026-10-09. Base `26351115` (`merge/staging-sync`).

## Step 1 — the frame and the wiring (done)

`PrintFrame` (`web/components/print/pieces.tsx`) is the one frame every A4
document prints in; `PrintDocument` (`web/components/print/document.tsx`) is the
same frame with the verification QR built from a `verify` target.
`PaginatedSheet` is gone (the frame replaces it). `PrintPage`, `InstituteHeader`,
`QrFooterRow` and `PrintVerifyFooter` stay for the card sheets.

### Technique that held (Chromium 151)

- Header band: real content in the frame table's `<thead>`. Repeats natively.
- Footer room: an empty 25mm `<tfoot>` spacer. Repeats natively, so content
  never reaches the footer's strip.
- Footer band: lives in the thead cell, `position: absolute`, hung at
  `top: calc(100vh - 22mm)`. In print `100vh` is the page content box, so the
  band lands on the bottom edge of every page, portrait or landscape.
- Page number: `@page <name> { @bottom-right { content: ... counter(page) ... } }`
  with `margin-top: -13mm`, which lifts it out of the page margin into the
  band's empty right-hand slot.

### What did not hold

- `position: fixed` bands: fine for one document, wrong for batches. Every
  student's footer (each with its own QR) would print stacked on every page.
  The thead-anchored footer belongs to its own table, so batches work.
- Naming the page on the frame element (`page: print-doc-…`): a change of page
  name forces a page break, so every print gained a blank trailing sheet. The
  name now sits on `:root:has(.print-doc-…)`.
- Any opaque background over the footer's right slot hides the page number:
  margin boxes paint *under* page content. Print makes every ancestor of the
  frame transparent.
- Wrapper padding (`<main class="p-6">`) pushed page 1's footer 6mm into the
  page margin. Print zeroes padding/margin/border/max-width on every ancestor
  of the frame (`:has(.print-doc)`).
- `transform` / `position: relative` on a margin box: ignored. Only the
  negative margin moves it.
