# Student Portal (map #434) — live UI audit

**When:** 2026-08-27 · **Where:** `https://adarshamodelschool.staging.edumebd.com` (staging deploy of `staging`, `de68d22`)
**Who:** `s0022@adarshamodelschool.students.invalid` (Hasibul Islam, S0022, Eight / Day - A)
**How:** Playwright, driven by hand across all 12 `/student/*` screens, every write path, desktop 1280×900 + mobile 390×844, bn + en, light + dark. DB claims verified against the shared Supabase project.

Nothing here is a styling nit for its own sake. Every item was reproduced live; the ones with a root cause name the file.

---

## P0 — broken

### 1. Withdrawing a homework submission always fails
Upload works. Pressing **সরিয়ে নাও** renders a raw platform error inline, in English, in a Bangla student UI:

> `Direct deletion from storage tables is not allowed. Use the Storage API instead.`

Root cause: `web/supabase/migrations/0142_homework_submissions.sql:175` — `drop_submission_object()` does `delete from storage.objects …` in an `after delete` trigger, and Supabase's `protect_delete()` on `storage.objects` blocks exactly that. The failing trigger aborts the row delete, so the submission can never be withdrawn or replaced.

Not student-only: the same delete fails **as service role from SQL**, so nobody can clear these rows without dropping the trigger first.

Fix: drop the trigger; delete the object with the Storage API in `withdrawSubmission` (`web/lib/student/submissions-source.ts:62`) — `submit-work.tsx:69` already does exactly that on the upload-rollback path.

Left behind by this audit: one `probe.pdf` submission on task `d185d90c…` for S0022 — it cannot be removed until this is fixed.

### 2. Students read the school's billing reminders
The student's notice list carries **"Subscription expiring soon"** — body: *"…your EdumeBD subscription expires on … Please renew to avoid interruption."*

Root cause: `web/supabase/migrations/0069_subscription_expiry_reminders.sql:80` — `record_subscription_reminder` inserts the reminder into `publications` as `kind='notice', target_type='all'`. That was staff-only reach before #434; students read notices now, so every student of a school sees its renewal state. The owner already gets this separately through the `SubscriptionExpiringSoon` event and its notification consumer, so the publication row is redundant as well as leaky.

Fix: stop writing the publication, or target it at staff.

### 3. Logging in at the apex domain makes a student log in twice
`staging.edumebd.com/login` with valid student credentials → redirect to `adarshamodelschool.staging.edumebd.com/login`, empty form, no message, no explanation. Second login on the subdomain works.

Console at the moment of the bounce:
> `Access to fetch at 'https://adarshamodelschool…/student' (redirected from 'https://staging.edumebd.com/student?_rsc=…') has been blocked by CORS policy: Redirect is not allowed for a preflight request` → `Failed to fetch RSC payload … Falling back to browser navigation`

The session cookie is on the apex, the redirect target is the subdomain. A student handed one URL and told "log in" hits this every time.

### 4. On a phone, the student cannot log out
At 390 px the header's content is 451 px wide and does not scroll (`overflow-x: visible`, `scrollLeft` pinned at 0). Log out (right edge at 451 px) and the avatar sit off-screen and unreachable. Theme and language controls are 24 px tall — under the 44 px touch target the same header uses for its icon buttons.

### 5. Every student print view loses the school logo
`/student/fees/print` requests `/api/school-logo` → **403**, image renders at zero width.

Root cause: `web/app/api/school-logo/route.ts` takes the default `requireSchoolMember` guard, and a Student is not a school member. The map built `/api/student/{photo,material,publication-image,submission}` with a student guard for exactly this reason and missed the logo. Affects the fee statement, the mark sheet/result prints and the admit card — every page whose whole point is being printable.

---

## P1 — visibly wrong or missing

6. **Fees never show what was owed.** Cards are paid / fine / due; columns are month, paid, fine, due. There is no *payable*, so a student sees "৳৬০০ paid" with nothing to compare it against, and the due column can only ever be read on faith. #453 specified payable, paid, fine, due.

7. **Attendance reads as an accusation.** 3% · 1 present · 30 absent working days, for a school that recorded attendance twice all month. The number is deliberate (`student/attendance/page.tsx:10` — it must agree with the absent-fine formula), but the student-facing screen states it as fact with no "no attendance recorded" state. A parent seeing 3% will call the school.

8. **The attendance calendar has no weekday header row.** Day 1 sits in column 1 regardless of which weekday it was, so the grid is unreadable as a calendar. The legend also has no *absent* colour while the summary counts 30 absences.

9. **Success feedback for a question is a bare `✓`.** No sentence, no toast, no link to the question. Leave requests do this properly ("আবেদন পাঠানো হয়েছে।") — the question form should match.

10. **Leave requests accept duplicates and past dates.** The same range submitted twice creates two pending requests; the date inputs carry no `min`, so leave can be requested for last year. Nothing can be withdrawn once sent. Reason is a single-line `<input>`, not a textarea, and is not required.

11. **The validation message is English.** `To date must be on or after the from date`, in the Bangla-default UI.

12. **Notice priority is a raw enum.** `urgent` / `important` render lowercase and untranslated in both list and detail, beside fully translated audience and date.

13. **The student never sees their own photo.** No image anywhere on `/student/profile`, though the correction form offers "ছবি" and `/api/student/photo` exists.

14. **The photo correction's file input is the raw browser control** — "Choose File / No file chosen", English, unstyled, outside the design system, and no accepted-types or size hint. The homework upload has the same gap (`accept` is set to jpeg/png/webp/pdf but never shown).

15. **Questions lose their anchor.** A question asked from a notice appears in `/student/questions` with no reference to that notice — the very grouping #434 designed the feature around.

16. **Search says the wrong thing and finds too little.** Placeholder is "গ্লোবাল টাস্ক খুঁজুন…" / "Search global tasks…" — staff copy in a student portal. Results carry an English `Notice` type label. Subjects, teachers, materials and exams are not searchable; only notices matched.

17. **`/notifications` drops the portal shell.** Reached from the bell's "সব দেখুন", it renders with no sidebar and no header — a different application to the student mid-flow.

18. **404 is the stock Next.js page.** "404 — This page could not be found." English, unstyled, no shell, no way back.

19. **Every page's `<title>` is "EdumeBD".** Twelve screens, one tab label; history and bookmarks are unusable.

20. **Mixed numerals inside a single view.** "S0022 / roll 1" beside "বৃহস্পতিবার ২৭ আগ"; the fee table pairs "৳৬০০" with "মে 2026"; the attendance grid uses Latin digits under a Bangla month heading.

---

## P2 — the portal feels unfinished

21. **Home stops half a screen up.** Chips, three ID cards, today/tomorrow — then nothing on a 900 px viewport. Missing what the student actually opens the app for: homework due, unpaid fees, the next exam, the newest notice's title (today there is only a count).

22. **The weekly routine does not mark today**, cannot be printed, and on mobile is a 595 px table in a 340 px scroller rather than a per-day view.

23. **The task list shows a title and nothing else** — no due date, no subject, no submission state — and the detail page adds no due date either. The one seeded homework is titled "Class Ten" and is visible to this Class Eight student because it was posted `target_type='all'`.

24. **Empty states are one grey sentence.** Materials, results, exams and questions all bottom out at a single line with no next step.

25. **No skip link** anywhere in the shell.

---

## What could not be tested, and why

Five surfaces are empty on the demo school because the data isn't there — verified in the DB, not a code fault:

| Screen | Why empty |
|---|---|
| Results | `exams.results_published_at` is null for all 4 exams; 0 `exam_marks` for S0022 |
| Exam schedule / admit card | all 4 exams have `class_id` null, no `start_date`, 0 `exam_routine_entries` |
| Study material | the only `lesson_plan` targets Nine/B; no `class_syllabi` row for Eight |
| Notifications | none of the four fan-out events have fired for this student |
| Read-only-on-expiry | the demo school is active; every write succeeded |

Also seen: the demo school's `exams` table is full of `E2E Exam 1786…` and `test` fixture rows, and a second student holds `student_no = 'S0022'` in a school with a null subdomain — the shared-DB fixture accumulation already known from earlier work.

**To make the portal demo-able**, seed for Eight / Day - A: one exam with `class_id` + `start_date` + routine entries + marks + `results_published_at`, one syllabus or lesson plan, and a month of attendance.

## Test residue

Removed: 2 leave requests, 1 question. Still present: 1 homework submission (`probe.pdf`) that P0-1 makes undeletable.

---

## Status (2026-08-28) — fixed

Every item above is fixed on `fix/student-portal-ui-434`, verified against a
production build on the shared database. Two exceptions, both recorded rather
than quietly dropped:

- **23, "no subject"** — `publications` has no `subject_id`, so a homework post
  does not know its subject. Showing one needs a schema change and a change to
  the staff-side compose form; out of scope for a UI fix. Due date and
  handed-in state landed.
- **0158's cleanup delete** — the migration retires the billing notices already
  published, but that one statement could not be run from this session (the
  sandbox refuses row deletes). The RPC no longer writes new ones; apply the
  migration to clear the rows already out there.

Also worth knowing: the auth cookie is renamed as well as re-scoped
(`edume-auth`), so everyone signs in once more after deploy. That is deliberate
— see `web/lib/auth/cookie-options.ts` for why a rename beats leaving two
same-named cookies to shadow each other.
