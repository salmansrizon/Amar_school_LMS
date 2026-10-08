# Exams and marks migrations — rollout notes (written, not applied)

Issues #702, #698, #679, #700, #699 (and #701, which needs no migration).
Four files, `0221`–`0224`, in `web/supabase/migrations/`. None has been run
against any database. The integration tests written for them have not been run
either. Staging and production share one database: apply on a branch database
first.

The app on this branch works before and after each file. Each file's header
holds the same pre-check and rollback as below, in full.

## Order

| Step | File | Kind | Depends on |
|---|---|---|---|
| 1 | `0221_student_reads_grading_scheme.sql` | policy + function | nothing |
| 2 | `0222_cleanup_all_zero_exam_marks.sql` | **DATA CHANGE** (deletes rows) | owner's decision; before 0223 is simplest |
| 3 | `0223_exam_marks_absent_and_atomic_save.sql` | columns + function | nothing (0222 first is advised) |
| 4 | `0224_exam_routine_no_class_overlap.sql` | trigger | nothing |

`0221` and `0224` are independent of the others and of each other. `0222`
before `0223` is advised because after `0223` an absent student is stored as an
all-zero row; `0222` skips rows flagged absent when the column exists, so the
other order is also safe.

## 0221 — a student reads the grading scheme of their own published result (#702)

- **Adds** `student_reads_grading_scheme(uuid)` (definer, `search_path = public`,
  default grants kept on purpose: it is a policy helper, see the file header)
  and one SELECT policy each on `grading_schemes` and `grade_bands`.
- **Rule**: readable only when the scheme is used by an exam that is published
  and holds a mark of the calling student. The same exams `student_exam_result`
  already shows.
- **Pre-check**: the query in the file header lists each scheme that becomes
  readable and by how many students. Also list the existing policies on the two
  tables to confirm the names are free.
- **Expected change**: no rows change. The student result page shows grade, GPA
  and pass/fail again, the "grades are not available yet" card disappears, and
  the print link returns. No app deploy needed: the graded path was already
  there.
- **Check after**: sign in as a student with a published exam; open the result
  and the printed mark sheet. As a student of another class, or with the exam
  unpublished, the scheme must stay unreadable.
- **Rollback**: drop the two policies, then the function (header).
- **Not solved here** (listed in #702 as related limits): `student_exam_result`
  still inner-joins `exam_marks`, so an exam with no mark at all for the student
  does not appear, and an unmarked subject of an earlier class cannot be judged.
  That needs the view to left-join the exam's subjects — a new database need.

## 0222 — DATA CHANGE: delete ambiguous all-zero marks (#698)

- **Deletes** `exam_marks` rows where all three components are 0, the exam is
  open, its results are not published, the subject has full marks above 0, and
  the row was created before the cutoff. Every deleted row is copied to
  `exam_marks_cleanup_698` (no API access) first.
- **Two values to set in the file before applying** (top of the `do` block):
  - `v_cutoff` — the time the marks-entry fix went live. After that moment an
    all-zero row can only be a typed zero and must be kept. The default `now()`
    is right only if this runs before or with that deploy.
  - `v_exam_ids` — leave `null` for every matching exam, or list exam ids if the
    owner decides exam by exam.
- **Pre-check**: header query (a) is the per-exam report the issue asks for,
  with a column for how many rows this file would delete; query (b) lists the
  exact rows with student and subject names.
- **Expected change**: `exam_marks` loses exactly the rows of query (b). The
  migration prints the count. Those students read "incomplete" instead of
  failed, and the exams list progress drops for those exams.
- **Not touched**: closed exams and published exams.
- **Risk**: a real zero in every component on an open, unpublished exam is
  deleted too and must be typed again. Query (b) shows them beforehand.
- **Rollback**: re-insert from `exam_marks_cleanup_698`, then drop it (header).
- **App side, already on the branch**: the exams list progress now uses the
  publish dialog's tally (current roster × class subjects) instead of a row
  count.

## 0223 — absent flag, half-filled rows, one-transaction save (#679, #700)

- **Changes** `exam_marks`: the three component columns lose NOT NULL; adds
  `is_absent boolean not null default false` and the CHECK
  `exam_marks_absent_is_zero`. **Adds** `save_exam_marks(uuid, uuid, jsonb, uuid[])`
  — security INVOKER, so row level security and the closed-exam triggers stay
  the authority; execute revoked from `public` and `anon`.
- **Pre-check**: header (a) column state, (b) no function of that name, (c) row
  counts to compare afterwards.
- **Expected change**: no row changes. In marks entry an "Absent" column
  appears, a row may be saved with one component blank, and one Save is one
  transaction.
- **Before it is applied** the app does what it does today: no absent column,
  a half-filled row is refused, the save is two statements.
- **Rollback**: header, five steps. Step 3 needs a decision when half-filled
  rows exist, because NOT NULL cannot return while NULLs are stored.

### Decisions taken (conservative; each can be reversed)

1. **Absent is per student per subject**, not per exam: the row is per subject.
2. **Absent counts as entered, with 0 marks**: the student fails that subject,
   exactly as when the teacher typed 0. Result book, promotion, rank and the
   student portal need no new rule. The alternative — absent shown as its own
   state on the mark sheet and left out of the average — is a change to
   grading and to four print templates and was not built.
3. **A row with a blank component is "not entered yet"**: it does not count
   toward progress, and the student reads "incomplete", never failed. Readers
   filter on `obtained_marks is not null` (a generated column, so null exactly
   for those rows).
4. **The column defaults stay 0**, so existing inserts that name one component
   behave as today.

### Known gaps after 0223

- `student_exam_rank` sums `coalesce(obtained_marks, 0)`: a student with a
  half-filled subject is ranked as if it were 0. The portal hides the rank for
  an incomplete result, but other students' ranks are computed over it. Not
  changed (it is an applied function and the issue does not ask for it).
- The absent flag is not printed anywhere: mark sheet and result book show 0.
- `save_exam_marks` does not check a mark against the subject's maximum; the
  app does, the table never did.

## 0224 — exam routine: no overlapping sittings within a class (#699)

- **Adds** a trigger `exam_routine_entry_time_free` (function
  `enforce_exam_routine_no_class_overlap`, definer, no execute grant). It takes
  a per-class transaction lock and refuses (SQLSTATE `23P01`) a sitting that
  overlaps another sitting of the same class on the same day, in any exam of
  that class.
- **Decision**: a trigger, not the exclusion constraint the issue names. The
  class is on `exams`, not on the routine row, so a constraint needs
  `btree_gist`, a copied `class_id` kept in step by more triggers, and it cannot
  be added `not valid` — it would fail on any existing overlap. The trigger
  gives the same guarantee for new and changed rows and leaves old rows alone.
- **Pre-check**: header query lists overlaps that exist today. Zero rows
  expected. The file applies either way; rows found are real double bookings to
  fix on the routine screen.
- **Expected change**: no row changes.
- **Before it is applied** the app's own check already compares all exams of
  the class; only two saves at the same moment can still both pass.
- **Not covered**: changing an exam's class after its routine is entered.
- **Rollback**: drop the trigger, then the function.

## Tests

Written beside the others in `web/tests/integration/`, each marked NOT RUN:

- `student-grading-scheme-read.test.ts` (0221)
- `exam-marks-absent-save.test.ts` (0223)
- `exam-routine-class-overlap.test.ts` (0224)

`0222` has no integration test: it is a one-time delete whose input is the old
bug's data. Its pre-check query is the test.

Existing tests to look at when applying: `exam-marks.test.ts` and
`student-results.test.ts` insert marks naming one component and rely on the
column default 0, which is unchanged.
