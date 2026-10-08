# Print QR → public verification page

Branch `worktree-agent-aab7718f32955c155`, based on `17739946` (`merge/staging-sync`). Owner's decisions of 2026-10-08.

## State

| Step | State |
| --- | --- |
| Migration `0260_print_verification.sql` | written, **not applied** (owner pastes it) |
| Pure rules `web/lib/print-verify.ts` + unit tests | done |
| QR on every print | done (list below) |
| Public page `/verify/d/<kind>/<token>[/<ref>]?p=YYYYMMDD` | done |
| Integration test `tests/integration/print-verification.test.ts` | written, **not run** (needs 0260) |
| Browser check | see "Browser check" |

Add 0260 to the migration index issue (#708) when this lands.

## How it works

- One helper builds every link: `printVerifyQr()` in `web/lib/print-verify-server.ts` (host from the request, like the ID card). One component puts it on the page: `PrintVerifyFooter` (`web/components/print/verify-footer.tsx`), which fills the existing `QrFooterRow` slot. Templates that already took `qrSvg` keep that prop.
- One function answers every scan: `print_document_facts(p_kind, p_token, p_ref)`. It returns a fixed allow-list per kind or `null`.
- `web/lib/print-verify.ts` holds the kind list, the URL shape, print-date parsing, the changed-after-print rule and `toVerifyModel`, which applies the allow-list a second time before anything reaches the page.
- The existing `/verify/<token>` ID-card page and `student_by_public_token` are untouched.

## What a scan shows

Every kind: school name and logo, document type, Genuine / Not valid.

| Kind | Token | Ref | Facts | Not valid when |
| --- | --- | --- | --- | --- |
| `mark_sheet`, `progress_report` | student | exam | name, class + section, roll, exam + year; if published: result (pass/fail), GPA, grade, total obtained (or "Incomplete" with no figures when a mark is missing) | results not published; student archived |
| `admit_card` | student | exam | name, class + section, roll, exam + year | exam closed; student archived |
| `fee_receipt` | student | fee record | name, class, month/year, amount received, payment date | voided (shows "Voided on <date>", no amount, no payment date) |
| `admission_form` | student | none | name, class, student number | student archived |
| `student_log`, `fee_statement` | student | none | name, class | student archived |
| `exam_attendance_sheet`, `seat_plan`, `exam_routine` | school | exam | exam + year | never (exists or "not found") |
| `class_routine` | school | class offering | class + section, year | never |
| `attendance_book` | school | class offering, or none when the sheet spans classes | class + section, year (or nothing) | never |
| `id_cards`, `general_ledger`, `template_*` (5) | school | none | nothing | never |

"Missing" (exam, fee record, class, token) is always the same "This code is not valid" page with HTTP 404, whichever part was wrong.

## Decisions made while building (owner should know)

1. **GPA is computed in TypeScript, so raw marks cross from the database to the server.** `lib/grading.ts` is the only grading algorithm and nothing stores GPA. For a published result the function returns the grading scheme and one `{full_marks, obtained, optional}` per subject, with no subject id or name and ordered by mark, and `toVerifyModel` runs the same `assembleRosterRows` the school's mark sheet prints from. The page shows only the four figures. **Residual:** someone who holds a valid mark-sheet QR and calls the RPC directly (not the page) can read those unnamed per-subject numbers. Closing that fully needs either a stored GPA or a server-only key for this call; the app has neither today.
2. **A student must belong to the exam.** Student token + exam id only resolves when the student has a mark in that exam or was ever enrolled in its class. Otherwise any student's token (it is on their ID card) plus any exam id would read as a genuine admit card.
3. **`exam_print_all` is not a kind.** Print-all prints per-student admit cards / mark sheets / progress reports, so each sheet carries that student's own QR (`admit_card` / `mark_sheet` / `progress_report`).
4. **Student portal needs its own token.** A Student cannot select `students`, and `student_self` has no token, so 0260 adds `print_tokens_self()` (authenticated only, own row only).
5. **Admit card template 1** had no QR by design ("strict reference"). It now ends in the shared footer like every other print.
6. **The QR is bigger.** 112 px (29.6 mm) with a 4-module quiet zone and white ground, instead of 84 px with no quiet zone inside a border that clipped it. A ~125-character URL is a version 7-8 symbol, about 0.5 mm per module. The footer is 28 px taller.
7. **Fee receipt validity ignores archiving.** A receipt for a student who later left is still a genuine receipt.

## "Changed after it was printed"

Shown when the record's changed-at falls on a later school day (Asia/Dhaka) than `?p=`. Same-day changes are not reported: the QR carries a day, not a time.

| Kind | Changed-at used |
| --- | --- |
| `fee_receipt` | `greatest(updated_at, void_at)` (further payment, or the void) |
| `mark_sheet`, `progress_report` | `exams.results_published_at` (published or re-published after printing) |
| everything else | **none** |

Not covered, because nothing records it: a mark edited without re-publishing (`exam_marks` has no updated-at), a student renamed or moved class (`students` has no updated-at), an exam renamed (`exams.updated_at` also moves on seat-plan publish, so it would cry wolf), routine or seat-plan edits.

## Before the migration is applied

- Student kinds on owner pages: the token exists (0065), so the QR prints. Scanning calls a function that is not there, the page shows "This code is not valid" (404), no crash.
- School kinds (lists, routines, templates, ledger, bulk ID cards): `schools.public_token` is missing, the lookup returns null, the footer prints the labelled "QR Code" box as before.
- Student portal prints: `print_tokens_self()` is missing, same labelled box.
- Prints made before 0260 with a QR start working the moment it is applied; prints made with the box need reprinting.

## Abuse

- Stops bulk scraping: tokens are 122 random bits; record-backed kinds also need the record's uuid, and the function checks it belongs to that student / school; every miss returns the same `null`; no ids or tokens are ever returned.
- Does not exist: **rate limiting** (the app has no helper for public endpoints and none was built), token rotation, and scan logging.
- `schools.public_token` is readable by anyone who can already read the school row (staff, that school's students, super admin, territory roles). It only proves "a document of this school"; record-backed kinds still need the record id.
- A wrong token returns one lookup earlier than a wrong reference. With 122-bit tokens that timing difference cannot be used to find one.

## Prints wired

Owner: mark sheet, progress report, admit card (both templates), print-all (all three documents), fee receipt, admission form, student attendance log, attendance book, exam attendance sheet (each room sheet), seat plan, exam routine, class routine, general ledger, bulk ID cards (sheet footer; each card keeps its own `/verify/<token>` QR), the five blank templates.

Student portal: mark sheet, admit card, fee statement, class routine.

Unchanged on purpose: single ID card (`/verify/<token>` already). Not wired: the student login credential slip (`students/[id]/login-controls.tsx`, a password slip, not a document) and the distributor invoice (`app/distributor/invoices/[id]`, not a school print; no school or student token applies).

## New strings

All under `verifyDoc.*` in `web/lib/i18n.ts`, for wording review:

| Key | bn | en |
| --- | --- | --- |
| title | নথি যাচাই | Document verification |
| genuine | আসল | Genuine |
| notValid | বৈধ নয় | Not valid |
| genuineNote | এই নথিটি প্রতিষ্ঠানের রেকর্ডের সাথে মিলেছে। নিচের তথ্য এই মুহূর্তের রেকর্ড থেকে দেখানো হচ্ছে। | This document matches the school records. The facts below are read from the records right now. |
| codeNotValid | এই কোডটি বৈধ নয় | This code is not valid |
| codeNotValidNote | এই QR কোডটি কোনো নথির সাথে মেলে না। | This QR code does not match any document. |
| reasonArchived | শিক্ষার্থী আর এই প্রতিষ্ঠানে নথিভুক্ত নেই। | The student is no longer enrolled at this school. |
| reasonUnpublished | এই পরীক্ষার ফলাফল প্রকাশিত নয়। | The results of this exam are not published. |
| reasonExamClosed | এই পরীক্ষা বন্ধ হয়ে গেছে। | This exam is closed. |
| reasonVoided | এই রসিদটি বাতিল করা হয়েছে। | This receipt was voided. |
| changedAfter | এই রেকর্ডটি {date} তারিখে প্রিন্ট করার পর পরিবর্তন করা হয়েছে | This record was changed after it was printed on {date} |
| admissionForm | ভর্তি ফরম | Admission Form |
| feeStatement | ফি বিবরণী | Fee Statement |
| exam | পরীক্ষা | Exam |
| result | ফলাফল | Result |
| totalObtained | মোট প্রাপ্ত নম্বর | Total marks obtained |
| paidOn | পরিশোধের তারিখ | Payment date |

Reused for document types and labels: `markSheet.docWord`, `progressReport.docWord`, `admitCard.docWord`, `fees.receipt`, `attendance.studentLogTitle`, `attendance.bookRegisterWord`, `routine.docWord`, `examAttendanceSheet.docWord`, `seatPlan.docWord`, `examRoutine.docWord`, `students.idCard`, `ledger.title`, `institute.template*`, `verify.issuedBy`, `markSheet.studentName`, `students.class`, `students.roll`, `students.studentNo`, `exams.year`, `exams.incomplete`, `markSheet.pass`, `promotion.fail`, `markSheet.gpa`, `markSheet.grade`, `fees.month`, `fees.receivedAmount`, `fees.voidedOn`.

## Browser check (2026-10-08, headless Chromium, owner-a, read-only, 0260 not applied)

URL shape in the QR: `http://localhost:3781/verify/d/<kind>/<token>[/<ref>]?p=20261008`.

- Admit card (templates 1 and 2), mark sheet, progress report, admission form, fee receipt: one QR each, 112 × 112 px in print media, and its modules are identical to a QR generated from the expected URL (the owner's own token read through the API, kind, record id, today's date). 53 to 57 modules a side including the quiet zone.
- Class routine, exam routine, seat plan, attendance template, admission template, general ledger: the labelled box, no QR. Reading `schools.public_token` returns Postgres `42703` (column does not exist), which is the fallback path.
- Exam attendance sheet: no footer at all on the exam tried, because that exam has no seated rooms and the page prints no sheet. Not seen with a sheet.
- Scan page, signed out: a real student token + real exam (function missing), an unknown token, an unknown kind, a malformed token, a malformed ref, two ref segments, a school kind with a junk `?p=`: all HTTP 404, all the same text, `robots: noindex, nofollow`, no error overlay, no page errors. The language switch turns it to English in place.
- The existing `/verify/<token>` ID-card page still returns 200 with "Valid ID card".
- PDF page counts were the same with the new footer, with the mark shrunk to the old 84 px, and with the footer removed, on every page tried. Several of those pages are already 2 pages in this headless render without any footer, so this does not prove a sheet that exactly filled one page still does.

Not opened: the student portal prints, attendance book, student log, print-all, bulk ID cards, and the homework / lesson-plan / exam-answer templates. They compile and use the same footer.

## Checks

- `npx tsc --noEmit`: clean.
- `npx eslint` on every changed file and directory: clean.
- `npx vitest run tests/unit`: 173 files, 1931 tests, all passed. Two existing tests changed: `print-pieces.test.tsx` (the footer prop is now `qrSvg`) and `shift-filter-required.test.ts` (an exemption with its reason for the by-id token read).
- `jev_review` (per file): **escalate**, composite 0.65, safe_to_apply 0.16. Limiting: the SQL on correctness (confidence 0; it has never been executed), the page and both helpers on test gap.
- `jev_verify`: 7 claims verified, the deliberately false control ("integration test was run and passed") contradicted.

## Not verified

- The SQL has never been executed: not parsed by Postgres, not applied, integration test not run.
- No scan has returned facts, so the "Genuine" page with real facts has never rendered in a browser. Its mapping is covered by unit tests only.
- No real phone has scanned a printed sheet.
- The production host makes the URL longer than `localhost:3781`; the symbol grows by a version or two and stays near 0.5 mm per module at 29.6 mm, by arithmetic, not by measurement.
