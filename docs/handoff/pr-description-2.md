# Profile pages, print frame, photos in lists, phone layout

Base: `staging` (`d2b5022`, after #709). Head: `merge/staging-sync`. Fast-forward on `staging`.

## Read this first

1. **Every A4 print changed shape.** All A4 documents and admit cards now print inside one shared frame: a fixed 24 mm header band and a fixed 22 mm footer band on every page, the footer always at the bottom of the page. ID cards are untouched.
2. **One migration, already applied:** `0262_employee_photo.sql` (photo column on employees, private bucket `employee-photos`, the same five storage policies as `student-photos`). No other database change.
3. **Integration and e2e suites have not been run.** The repository has no pipeline for them; the only automatic check is the Vercel build.
4. **Page numbers on prints need Chromium 131 or later** (`@page` margin boxes). Safari and Firefox print no page number.

## What is in it

**Prints** (`web/components/print/`, print blocks of `web/app/globals.css`)
- `PrintDocument` frame: header band (logo, school name, address and codes, document title), footer band (20 mm QR, "EdumeBD দ্বারা পরিচালিত", "পৃষ্ঠা X / Y"), content flowing between them. Both bands have a fixed height; long text is cut with an ellipsis.
- Watermark: the school's own logo, centred, 150 mm on portrait and 120 mm on landscape, grey at 6% opacity. A school with no logo gets no logo and no watermark; there is no brand fallback.
- Tables: one `print-table` style — hairline grid, shaded repeating header row, one-line dates, right-aligned tabular numbers, pills as plain text.
- Signatures: 19 mm clear above each line, 8 mm below; the block never splits across pages.
- Page budget: every print is on the same or fewer pages than before, except the attendance book for a whole school (277 students: 6 pages scaled to about 6pt before, 8 unscaled landscape pages at 9pt now — owner's decision). Smallest printed text is 8.5pt. Before/after table: `docs/handoff/print-header-footer.md`.
- The class routine print opens in the shared print popup like every other print.

**Profile pages**
- Student, employee and the student's own profile follow the owner's mockup: header card with round avatar and icon actions, aside with a round photo and key facts, topic cards in a grid with a small illustration each.
- Student and employee detail pages have tabs kept in the address (`?tab=`): General, Academic, Guardian, Contact, Notes (student); General, Academic, Bank, Qualification (employee). Sections moved under tabs; none was removed.

**Photos**
- Lists show the person's photo when one exists, else the letter tile: student list, archive, drawers, leave rosters, fee roster; employee list, archive, drawer, leave roster.
- One read and one storage call per list page (`web/lib/photos.ts`); a broken image falls back to the letter tile.
- Employee photos are new: upload on the employee profile, reusing the student upload.

**Phones**
- List cards keep every field; the row action fills the width at 44 px and the row menu is a bordered 44 px square (shared `DataTable`, all owner lists).
- Tabs, sub-navigation, filters and action rows are full width or centred as a group; page headers (breadcrumb and title) stay left-aligned.
- Submit and save buttons are 44 px tall and full width on phones.

## Tested

- `tsc --noEmit`: clean.
- Unit tests: 1968 passed.
- `next build --webpack`: passes.
- eslint: one error, `web/app/claim/page.tsx:33`, identical on `staging`.
- Prints: real PDFs rendered for each document type on the old and new code (page counts in the table above); the general ledger checked page by page.
- Employee photo: uploaded through the app on a test employee; shown on the profile and in the list. Storage rules checked in the database.
- Phone layout: measured at 390 px on the attendance, student, fee, institute and question pages; header left edge equal to the cards' at 390 px and 1440 px.

## Not tested

- Integration and e2e suites.
- Exam attendance sheet and seat plan with real rows (no test exam has a seat plan); a real school logo as watermark; scanning the 20 mm QR from paper.
- Page numbers in Safari and Firefox (expected: none).
- Phone layout at 360 px and in English on the pages changed last; the remaining owner lists at phone width.
- A tinted admit-card theme hides the page number; the white theme shows it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
