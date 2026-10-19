# Notices, student portal and attendance leftovers: rollout notes (written, not applied)

Migrations 0250 to 0257, written on a worktree branch for issue #703 (items 4.5, 4.7, 5.1, 5.2, 5.4, 5.5, 5.6, 5.8) and #696. **None is applied.** Staging and production share one database, so each one is live for production data the moment it is applied.

Every file has a header with: what, why, the choices taken, who may read or write, effect on existing data, a read-only pre-check, and rollback SQL in a safe order. Every file can be run twice and ends with `notify pgrst, 'reload schema';`. The app works before and after each one: details per section.

The integration tests named below were written for these files and **have not been run** (the integration suite writes to the shared database).

## Order

| Order | File | Item | Needs first | Needs the owner's yes |
|---|---|---|---|---|
| 1 | `0250_absence_sms_streak_skips_weekly_off_days.sql` | 4.5 | 0218 | **Yes**: changes which absence SMS is sent |
| 2 | `0251_class_attendance_days_range_and_archived.sql` | 4.7 | 0218 | No |
| 3 | `0252_notice_unpublish.sql` | #696 / 5.1 | 0198 policy unchanged (pre-check 2) | No |
| 4 | `0253_student_message_thread.sql` | 5.4 | none | No |
| 5 | `0254_student_message_replies.sql` | 5.6 | 0152 (`staff_may_answer_message`) | No |
| 6 | `0255_student_message_reads.sql` | 5.2 | none | No |
| 7 | `0256_student_message_body_length.sql` | 5.5 | pre-check must return 0 | No |
| 8 | `0257_student_deletes_unanswered_question.sql` | 5.8 | none | **Yes**: product decision (a Student can delete) |

0250 and 0251 are independent of the rest and of each other. 0253 to 0257 are independent of each other too: each can be applied or rolled back alone, and the app handles any subset. The numbers are only the suggested order.

Item 4.2 / #694 ("machine not synced") has **no migration**: see the last section.

## 0250: SMS streak walk skips weekly off-days (item 4.5)

- **What.** `absence_sms_candidates` gets one more `not exists` in its backward walk: a weekly off-day (`schools.weekly_off_days`) is stepped over, as 0218 already does for the anchor day. Privileges are untouched (`create or replace`).
- **Pre-check.** In the header: (1) rules and weekly off-days per School, (2) the candidates for the last 7 days (the function only reads; it sends nothing): keep the output, (3) the anon privilege.
- **Expected change.** Only streaks that cross a weekly off-day get shorter. With Friday + Saturday off and rules "exactly 2" and "3 to 4":
  - absent Thursday and Sunday: was 4 days ("3 to 4" SMS), becomes 2 ("exactly 2" SMS);
  - present Thursday, absent Sunday only: was 3 days ("3 to 4" SMS), becomes 1 (no SMS);
  - a Student with a record ON the weekly off-day and absent either side: was 3, becomes 2 (the off-day is stepped over, like an `off_days` row).
  - six worked cases are in the header. A School with `weekly_off_days = '{}'` sees no change.
- **After.** Re-run pre-check 2 and compare. Then `tests/integration/absence-sms-weekly-off.test.ts` on a branch database (it sets Test School A's weekly off-days while it runs and restores them).
- **Rollback.** The header holds the full 0046 body. Nothing stored changes either way.

## 0251: class attendance days, one year and no archived classmates (item 4.7)

- **What.** Replaces `student_class_attendance_days` (created by 0218; 0218 is not edited). A range over 366 days or a reversed range returns no rows; an archived classmate's marks no longer make a day "taken".
- **Pre-check.** Header: privileges (expect anon false, authenticated true) and the count of (class, day) pairs that are "taken" only through archived Students.
- **Expected change.** Student attendance pages ask for one month, so the range limit changes nothing for them. Days marked only for since-archived classmates stop counting as taken (pre-check 2 says how many).
- **App.** No app change. An empty result is already handled as "no taken days known".
- **After.** `tests/integration/class-attendance-days-range.test.ts`.
- **Rollback.** Header: the 0218 body.

## 0252: notice unpublish and republish (#696)

- **What.** `publications.unpublished_at` (null = published), a CHECK that only a notice may carry it, and the Student read policy gains `and unpublished_at is null`.
- **Decisions taken.** Republish keeps the original date (`created_at` is not touched). Notices only: homework and study material reach Students through definer views this file does not change. Gallery albums are not covered.
- **Pre-check.** Header: the column is absent; **the current policy text equals the 0198 text** (if a later migration changed it, rebase section 3 of the file first); row counts by kind.
- **Expected change.** None until a notice is unpublished. The policy can only return fewer rows than before.
- **App before.** Owner pages read without the column, show no Unpublish button, and the action answers "Unpublish is not available yet". **After:** an "Unpublished" chip on the list and detail, Unpublish (with a confirm) and Republish on a notice.
- **After.** `tests/integration/notice-unpublish.test.ts`. By hand: unpublish a notice as the owner, confirm the Student no longer lists it and its direct URL is a 404, republish, confirm it is back with the same date.
- **Rollback.** Header. Policy first (it names the column), then the CHECK, then the column. Unpublished notices become visible to Students again.

## 0253: thread link on student questions (item 5.4)

- **What.** `student_messages.thread_id` (self-reference, `on delete set null`) and a trigger: a follow-up may only point at an original question of the same Student.
- **Meaning.** null = an old row, grouped by anchor and title as today; equal to the row's own id = a new original; another id = a follow-up. No backfill.
- **App before.** The insert is retried without the column, the lists read without it: today's behaviour. **After:** two new questions with one title no longer merge; the teacher's drawer lists the other messages of the same thread.
- **Pre-check.** Header: column absent.
- **Rollback.** Header: trigger and function first, then index and column.

## 0254: several replies per question (item 5.6)

- **What.** New table `student_message_replies` for replies after the first. The first reply stays in `student_messages.reply_body`, so "answered", the reply time and the response report are untouched.
- **Access.** Student: select only, own questions only (`student_id = app_current_student_id()`; `student_id` is copied from the question by a trigger, never taken from the writer). Staff: read when they can read the question; insert only where `staff_may_answer_message` allows and a first reply exists. No update or delete for School roles.
- **App before.** The read fails and counts as "no further replies"; the "Add another reply" form is not shown; the action refuses with a clear message and never overwrites the first reply. **After:** the form appears on answered questions; the Student sees every reply in order.
- **Pre-check.** Header: table absent, helper functions present.
- **Rollback.** Header: drop the table and its trigger function. Further replies are lost.

## 0255: which reply is new (item 5.2)

- **What.** New table `student_message_reads` (message, student, `seen_at`). The Student writes their own marker under RLS when they open a conversation.
- **Why a table and not a column.** A Student has no update on `student_messages` by design, and any update of an old answered row would let the 0154 trigger invent a reply time.
- **Access.** Student: own rows only, for own questions only. Staff: nothing.
- **App before.** No "New reply" mark anywhere. **After:** the Student's question list shows "New reply" until the conversation is opened. Replies older than 14 days are never flagged, so applying this does not light up a Student's whole history.
- **Not done.** The student home page alert ("answered but not yet seen") is not wired; the list page is.
- **Rollback.** Header: drop the table.

## 0256: question body length (item 5.5)

- **What.** `CHECK (char_length(body) <= 4000)`, added `NOT VALID`.
- **Pre-check, required.** `select count(*) filter (where char_length(body) > 4000), max(char_length(body)) from student_messages;` must return 0 over the limit. Postgres checks a `NOT VALID` constraint on every later update of a row, so a teacher answering an old over-long question would be refused. If any exist, raise the number in the file and `QUESTION_BODY_MAX` in `web/lib/student/messages.ts` together.
- **App.** Enforces 4000 with a counter, before and after. Live on deploy, with or without this file.
- **Rollback.** Header: drop the constraint.

## 0257: a Student withdraws an unanswered question (item 5.8)

- **What.** A delete policy: own row, not answered (status, `reply_body` and `replied_at` all say so).
- **Decision taken.** Only before a reply. No audit copy is kept; the School loses sight of a withdrawn question. This is a product decision: confirm before applying.
- **App before.** The button is shown on an unanswered latest message; the delete matches no row and the dialog says the question could not be withdrawn. **After:** it is removed. Follow-ups pointing at a withdrawn original stay (their link becomes null).
- **Pre-check.** Header: no Student delete policy yet; count of withdrawable questions.
- **Rollback.** Header: drop the policy.
- **Test for 0253 to 0257.** `tests/integration/student-question-threads.test.ts` (needs all five applied).

## Item 4.2 / #694: "machine not synced": no migration

`staging` added `attendance_agents.last_heartbeat_at` and `last_health` (`0216_attendance_agents.sql`, ADR 0033). The heartbeat is the planned signal, so no `last_seen_at` column was added.

Built: the read side only (`web/lib/school/attendance-agent-sync.ts`). It reads the latest `last_heartbeat_at` of the School's active Agents from the view `attendance_agents_safe`.

- Machine Setup page: "Attendance Agent last synced: <time>", only when a heartbeat exists.
- Employee Attendance (calendar and table) and one Employee's attendance page: a warning when a "No record" working day is later than the School day of the last heartbeat.
- No heartbeat (null), no Agent, or 0216 not applied: nothing is shown. Today nothing writes `last_heartbeat_at` (the `agent_heartbeat` RPC is a later phase of the Agent plan), so these lines stay hidden until that phase ships.

How it lines up with the Agent plan: the plan (section 21) also describes per-device health (`attendance_machine_health.last_seen_at` or columns on `attendance_machines`). When that exists, the per-machine "last sync" on Machine Setup should read it; the school-level warning here can stay on the Agent heartbeat. Schools on the legacy ingest-token path (no Agent) get no signal from this.

## Item 5.9: subject on homework and study material: not built

Plan, for whoever picks it up:

1. `publications.subject_id uuid references subjects (id) on delete set null`, nullable, no backfill; extend the same-school check in `enforce_publication_shift_school` style (a subject of another School must be refused).
2. Students cannot read `subjects`. Homework: the Student reads `publications` directly, so `subject_id` arrives with the row and the name comes from `student_subject_option` (already readable). Study material: the Student reads the definer view `student_material`; appending a `subject_id` column means restating the whole view from 0198 **with** `security_invoker = off, security_barrier = true` (leaving those out caused a cross-tenant leak before: see the comment in 0198).
3. Owner compose form: an optional subject picker for the kinds homework, lesson plan, daily lesson and exam prep, limited to the subjects of the targeted class.
4. Student Tasks and Materials tables: a Subject column and filter.

## Item 5.7: attachments on questions (1 MB in total): not built

Plan:

1. Table `student_message_attachments (id, message_id → student_messages on delete cascade, school_id, student_id, storage_path, file_name, mime_type, size_bytes check (size_bytes between 1 and 1048576), created_at)`. `school_id` and `student_id` copied from the question by a trigger, as in 0254.
2. Total limit: a trigger on insert that sums `size_bytes` for the `message_id` and refuses above 1 048 576. The upload action checks the same before issuing a signed upload URL.
3. Private bucket `question-attachments`, `file_size_limit = 1048576`, allowed MIME types limited (images and PDF). Object path `<school_id>/<student_id>/<message_id>/<uuid>.<ext>`.
4. Storage policies on `storage.objects` for that bucket: a Student inserts and reads only under their own `<school_id>/<student_id>/` prefix (`app_current_student_id()`); staff read an object only when they can read the question (join through `student_message_attachments` to `student_messages`, so the 0152 rule applies); nobody updates; delete follows the question (0257) through a cleanup like `drop_submission_object` (0157).
5. Downloads through a route such as `/api/student/question-attachment` that checks the row and returns a short-lived signed URL, the pattern of `/api/student/submission`. Images are not rendered inline in the question text.
6. Table policies: Student selects and inserts own rows for own unanswered questions; staff select by the question read rule.

Open points for the owner: allowed file types; whether a teacher's reply can carry a file too; whether a withdrawn question deletes its files at once.
