# Wave 2 browser test — exams and fees (2026-10-08)

Tested in a browser (Playwright, Chromium) against the shared database, on
`merge/staging-sync` at `2e930672`, dev server on port 3742, Test School A only.
Every record made in this run is prefixed `W2-EXF`. Each item below is what was
seen on screen, not what the code says.

## Preparation

- Class used: `UXA-Att 1790996221552 - A — 2032` (the only active-year class;
  subjects Eng: theory 100, Math: theory 70 + MCQ 30).
- Admitted `W2-EXF Student One` (roll 91, student no. S9295) and
  `W2-EXF Student Two` (roll 92). Student One was given a login from the
  profile. The profile offers no SMS option when there is no guardian phone, so
  no SMS could be sent.
- Grading scheme `W2-EXF scheme` (GPA, pass 33%) with bands A+ 80–100 (5),
  A 60–79.99 (4), C 33–59.99 (2), F 0–32.99 (0).
- Exams `W2-EXF exam` and `W2-EXF exam 2`, both for that class, year 2032,
  start 1 Nov 2032, scheme `W2-EXF scheme`.

## #699 routine overlap — VERIFIED

`W2-EXF exam` routine, 1 Nov 2032:

| Sitting | Result |
|---|---|
| Eng 10:00–12:00 | saved |
| Math 11:00–13:00 (overlaps) | refused: "Another exam of this class is already scheduled at this time" |
| Math 12:00–14:00 (back-to-back) | saved |

`W2-EXF exam 2` (same class), 1 Nov 2032:

| Sitting | Result |
|---|---|
| Eng 10:30–11:30 (inside exam 1's Eng) | refused, same message |
| Eng 13:59–15:00 (one minute into exam 1's Math) | refused, same message |
| Eng 14:00–15:00 (back-to-back with exam 1's Math) | saved |
| Math 09:00–10:01, Bangla, 390px | refused: "এই সময়ে একই শ্রেণির আরেকটি পরীক্ষা আছে" |

Limit of this test: the app checks before the database does, so the refusals
seen are the app's check. The trigger of migration `0224` was not exercised on
its own (that needs two saves at the same moment).

## #679 absent vs not entered — VERIFIED (with the known gaps below)

Marks entry of `W2-EXF exam`, owner, English and Bangla, 1440px and 390px.

- The grid has an Absent column ("Absent" / "অনুপস্থিত") with one tick per
  student, and the help line reads "A blank cell means not entered — type 0 for
  a zero score. Tick "Absent" for a student who missed the paper…".
- Student Two, Eng: Absent ticked and saved. After a reload the tick is still
  set, the mark cells are locked ("—"), Total 0, Grade F.
- Student One, Math (theory 70 + MCQ 30): theory 50 typed, MCQ left blank,
  saved without a message. After a reload: theory 50, MCQ blank, Total "—",
  Grade "—" (not F).
- In that state: result book row "85 / 200 · Incomplete" ("অসম্পূর্ণ"), no GPA,
  no position; progress report Math line "— / 100 · Marks not entered"
  ("নম্বর দেওয়া হয়নি"); exams list progress 2 / 36 (the half-filled row is not
  counted).
- MCQ 20 filled later and saved: the row reads 70, grade A; result book
  "155 / 200 · 4.50 · A · Pass", position 1; list progress 3 / 36.
- Clearing a row: Student Two Math 10 + 5 saved (Total 15, F), then both cells
  emptied and saved. The row is gone: cells blank after reload, list progress
  still 3 / 36, result book "0 / 200 · Incomplete".

Gaps seen (both already listed in the rollout notes, not new):
- An absent student is shown as "0 / 100 · F" on the progress report and as 0
  in the result book total; the word "Absent" is printed nowhere outside the
  entry grid.
- On the progress report a half-filled subject reads "Marks not entered"; the
  50 that was typed is not shown.
- At 390px the grid scrolls sideways inside its card; the Absent column is off
  screen until scrolled. No page-level horizontal overflow.

## #700 atomic save — VERIFIED

Server-side calls to Supabase were logged during each Save (a fetch logger
preloaded into the dev server; no app code changed). Five saves were made
(absent, half-filled, fill, enter, clear). Each one made exactly one
`POST /rest/v1/rpc/save_exam_marks` and no `POST`/`DELETE` on
`/rest/v1/exam_marks` — the old two-statement path did not run, including the
save that both wrote One's row and cleared Two's row. Not tested: a failure in
the middle of a save (cannot be provoked from the browser).

## #701 subject switch — VERIFIED

`W2-EXF exam`, owner, English 1440px and Bangla 390px, switching Eng → Math → Eng.

- Opened by address (full page): after each switch the address carries
  `?subject=…`, the grid header changes ("Theory (100) · MCQ (0)" ↔
  "Theory (70) · MCQ (30)"), there is one grid on the page and no dialog. A
  marker set on `window` before the switch was gone afterwards, so the switch
  is a full document load, as the fix intends.
- Opened from the exams list (More actions → Marks Entry, the route popup):
  the grid is inside the dialog before and after each switch, the header
  changes the same way, and the `window` marker survives (no full load, the
  list stays underneath).

Seen, not a defect of this issue: inside the popup the `?from=…` part of the
address is dropped on the first switch.

## #702 student sees grades — VERIFIED

Student One's marks completed (Eng 85 / 100, Math 50 + 20 = 70 / 100) and
`W2-EXF exam` published by the owner (no other exam touched). The publish
dialog showed "Students with all marks entered 1 / 18 · Subjects complete
0 / 2" and the warning that the others stay "Incomplete"; the button reads
"Publish anyway". The dialog offers no SMS.

Signed in as `W2-EXF Student One` (English 1440px, Bangla 390px):

- Results list: "W2-EXF exam · 2032 · 155 / 200 · Complete" ("সম্পূর্ণ").
- Result page: GPA 4.5, Grade A, "Passed" ("উত্তীর্ণ"), Rank 1 / 2, and per
  subject "85 / 100 · A+(5)" and "70 / 100 · A(4)". No "grades are not
  available yet" card.
- "Print mark sheet" ("মার্কশিট প্রিন্ট") opens the print preview; the frame
  loads `/student/results/<exam>/print` (HTTP 200), its Print button is
  enabled, and the sheet shows grade and GPA per subject, "Total Marks:
  155 / 200", "Overall GPA: 4.50", "Pass".
- No page-level horizontal overflow at 390px.

Seen: the rank reads "1 / 2" — the absent Student Two is counted in the rank
although their result is incomplete (the known `student_exam_rank` gap).
Not tested: that a student of another class cannot read the scheme (it cannot
be seen from the screen).

## #678 fee amount — VERIFIED

Fee record for `W2-EXF Student One`, month 10/2026, cash, note `W2-EXF`
(receipt `13ed80e5-…`), owner, English 1440px and Bangla 390px.

- First save: fee 100, fine 10, received 60. The form showed Total Payable
  ৳110 and Due ৳50. Receipt: "Fee Amount ৳100 · Received Amount ৳60 · Fine ৳10
  · Adjustment ৳0 · Due ৳50" (Bangla label "ফি (নির্ধারিত) ৳১০০").
- Re-opening the form for the same month shows "Edit record" and the fee field
  pre-filled with 100, with no "estimated" hint.
- Edit: received 130 (20 more than payable). The review step warns "Receiving
  more than the total payable: ৳20" and the confirm button is disabled until
  "Yes, I am taking the extra as an advance payment" is ticked. Receipt after:
  "Fee Amount ৳100 · Received ৳130 · Fine ৳10 · Due ৳0 · Advance (Tk) ৳20"
  ("অগ্রিম (৳) ৳২০").
- This proves the fee is stored: worked out from the other figures it would
  read 120 (130 + 0 − 10), and the receipt reads 100.

### Defect found (not in #678, not fixed — it is money and a database trigger)

The receipt's **Total** and the **cash posting** are the received amount plus
the fine, although the received amount already covers the fine.

- First save: received ৳60, receipt "Total ৳70 · Seventy Taka Only", ledger
  impact "1000 Debit ৳70 / 4300 Credit ৳60 / 4400 Credit ৳10".
- After the edit: received ৳130, receipt "Total ৳140 · One Hundred Forty Taka
  Only", second entry "1000 Debit ৳70 / 4300 Credit ৳70" — cash debited ৳140
  in all for ৳130 taken.
- Cause on the screen side: `web/app/school/fees/receipt/[id]/page.tsx:97`
  calls `totalPayable(pay_amount, fine_amount, adjust_amount)` with the
  received amount in the place of the fee. The ledger lines come from the
  `fee_gl_post` trigger (migration `0097`), which posts the same sum. The form
  (`web/lib/fees.ts` `settleFee`) treats Received as covering fee + fine.
- Effect: with any fine, cash on hand in the books is higher than the money
  taken, by the fine. No issue was found for this.

Small: in Bangla the "In words" line stays English ("কথায়: One Hundred Forty
Taka Only").

## #683 void — VERIFIED as owner; staff side only PARTLY

Record `13ed80e5-…` (Student One, 10/2026, received ৳130, fine ৳10), English
1440px and Bangla 390px.

- The receipt has "Void record" ("রেকর্ড বাতিল করুন") for the owner. The dialog
  explains that the record stays and a reversing entry is posted, shows
  "Received Amount ৳130 · Fine ৳10" as what is reversed, and asks for a reason.
  "Confirm void" is disabled with an empty reason and with a reason of spaces
  only, in both languages.
- Voided with reason "W2-EXF test void". The receipt then shows a block
  "VOIDED · Voided on: 08/10/2026 · Reason for voiding: W2-EXF test void"
  ("বাতিলকৃত"), and "Void record" is gone.
- Print: the Print button calls the browser's print; in print media the page
  text starts "Receipt | Voided | Voided on: 08/10/2026 | Reason for voiding:
  W2-EXF test void | …".
- Ledger: the receipt's ledger impact gained "4300 Debit ৳130 / 4400 Debit ৳10
  / 1000 Credit ৳140", which cancels the two earlier entries exactly. The
  General Ledger tab shows two lines: "Fee Collection · W2-EXF Student One —
  10/2026 · ৳130" and "… — 10/2026 — Voided · ৳130" on the other side.
- Fee page: the record is listed with the status "Voided" and a "Receipt"
  action only. The cards went back to the figures from before the record
  existed: Collected ৳500, Due ৳500, Records 2 (they were ৳560 / ৳550 / 3 while
  the record was live with ৳60 received).
- Collect again: the roster shows Student One as "Not Collected · Collect" for
  10/2026, and a second record for the same month saved (receipt `9505eaeb-…`,
  fee 100, received 0). That one was voided too at the end as cleanup; with
  nothing received the receipt reads "No ledger entry for this record".
- Student: signed in as Student One, before the void the fee page listed
  "Oct 2026 · Paid"; after the void "No fee records yet."; with the second
  record only that one ("Oct 2026 · ৳100 · Due").

Not shown on the receipt: who voided it.

Staff side: `teacher-e2e@test.local` and `staff-e2e@test.local` both get
"Permission denied" for the receipt address — neither fixture has any access to
fees. So "refused" was seen, but a staff member who can open fees and still has
no void control was NOT seen; there is no such fixture and permissions of
existing accounts were not changed.

Seen on the student fee page before the void: "Payable ৳130 · Paid ৳130 ·
Fine ৳10" for a month whose fee + fine is ৳110 — the advance is shown as
payable.

## Fee roster label (item 8) — CONFIRMED, not changed

With a live record of ৳0 received (fee 100, due 100) the roster row reads
"W2-EXF Student One · 10/2026 · **Collected** · Edit record" ("আদায় হয়েছে"),
while the records table below shows the same record as "৳0 · Due ৳100 · Due".
The roster label only says that a record exists
(`web/app/school/fees/page.tsx`, the roster's status cell). Wording left alone.

## #681 director capital guard — PARTLY (what the screen can show is right)

Owner, English 1440px and Bangla 390px.

| Moment | Opening | Invest | Withdraw | Current balance | Rows | Last Running Balance row |
|---|---|---|---|---|---|---|
| Before | ৳13,14,000 | ৳81,000 | ৳0 | ৳13,95,000 | 162 | ৳13,95,000 |
| After invest ৳7, note `W2-EXF` | ৳13,14,000 | ৳81,007 | ৳0 | ৳13,95,007 | 163 | ৳13,95,007 |
| After withdraw ৳7, note `W2-EXF` | ৳13,14,000 | ৳81,007 | ৳7 | ৳13,95,000 | 164 | ৳13,95,000 |

- The last Running Balance row equals the Current Balance card at each step.
- The page has no delete control: its only controls are "+ Invest",
  "+ Withdraw", the tabs, the date filter, the type filter and the pager.
- Net effect of this run on the balance: zero.
- NOT tested: the guard of migration `0232` itself (a delete being refused or
  reversed). Nothing on the screen deletes a capital transaction, and SQL was
  out of bounds. The stored drift (opening ৳13,14,000) was left as it is.

## Records made in this run

| Record | State at the end |
|---|---|
| Students `W2-EXF Student One` (roll 91, S9295) and `W2-EXF Student Two` (roll 92), class `UXA-Att 1790996221552 - A — 2032` | left in place |
| Student login for Student One (`s9295@…students.invalid`) | left in place |
| Grading scheme `W2-EXF scheme` with four bands | deleted |
| Exam `W2-EXF exam` (routine, marks, published then unpublished) | deleted, with its routine and marks |
| Exam `W2-EXF exam 2` (one routine sitting) | deleted |
| Fee record `13ed80e5-…` (10/2026, received ৳130, fine ৳10) | voided, reason "W2-EXF test void" |
| Fee record `9505eaeb-…` (10/2026, fee ৳100, received ৳0) | voided, reason "W2-EXF cleanup" |
| Director capital: invest ৳7 and withdraw ৳7, note `W2-EXF`, 8 Oct 2026 | left in place (no delete exists); net zero |

Fee cards for 10/2026 at the end: Collected ৳500, Due ৳500, Records 2 — the
same as before this run. No SMS was sent. No record of another tester or of the
seed data was changed.

## Checks

- No application code was changed, so `tsc` and the unit tests were not run.
- The dev server ran with a preloaded logger for server-side Supabase calls
  (`.w2test/fetchlog.cjs`, not committed) — test harness only.
- jev (`jev_verify`, jev-1.13.0) on ten claims against the observations:
  8 verified (#699 0.89, #679 0.97, #700 1.00, #701 1.00, #702 0.99,
  #678 0.94, #683 owner side 0.98, #681 0.99). The deliberate false control
  ("the receipt Total equals the amount received") came back contradicted
  (0.66, review). The claim "a staff member who can open the fee screens has
  no void control" came back unsupported (review) — it was not seen.
