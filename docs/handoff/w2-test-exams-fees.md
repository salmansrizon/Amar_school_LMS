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
