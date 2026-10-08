# Evaluation 2 — `b40c47b..HEAD` of `merge/staging-sync` (head `8d903dd`)

Independent evaluation (Phase 4). Evaluator branch: `worktree-agent-ac0937a6d72959e4e`.
This file was rebuilt on 2026-10-07 after the scratch directory was wiped a second time; everything
below up to "Rebuilt here" was observed in earlier sessions on 2026-10-05/06 and is restated from the
session record. Findings after that line are appended as they are made.

## VERDICT SO FAR (Part 1 complete; Part 2 items B, C, J, K and most of L done; D–I, M–O and jev open)

**Ready with conditions** — nothing found so far that blocks a pull request.

- Fixed by me (commits on `worktree-agent-ac0937a6d72959e4e`, to be merged):
  - `78ff910` super-admin gov-official and vendor forms with a password post instead of GET (same class as #706).
  - `e6ace1e` a dialog open on first render broke server rendering (regression from `166d1d5`).
- Open defects, none blocking:
  - D-2 (older): the owner's fee collection roster says "আদায় হয়েছে" for a record with ৳0 received.
  - Wording: home "আগামীকাল: … রুটিন এখনো প্রকাশ করা হয়নি" on a day that merely has no periods.
  - Escape discards a typed follow-up draft without asking; employee drawer does not return focus (older);
    Base UI console message on the exam setup class picker; toast action button 24px high; Bangla-digit leftovers (see L).
- NOT possible: anything "as the DEMO student". Its password file (`scratchpad/demo2/cred.txt`) was wiped with the
  scratchpad before I could use it for more than one login. I did not reset that password. Substitute: my own student
  `EVAL2-শিক্ষার্থী পরীক্ষক` in the same class — it has none of the DEMO attendance / fee / leave / ticked-task data.

## TEST DATA LEDGER (Test School A)

| # | Record | Id | State |
|---|---|---|---|
| 1 | Student `EVAL2-শিক্ষার্থী পরীক্ষক`, roll 89, class `UXA-Att 1790996221552 - A`, guardian `EVAL2-অভিভাবক`, no mobile | `c48f8abf-c180-49f8-92c0-8fd6f410741d` | present — archive at the end (no hard delete in the app) |
| 2 | Student login `s9293@sch3d5b6aaf.students.invalid` (no SMS offered) | — | present — database only to remove |
| 3 | Lesson plan `EVAL2-xss পাঠ পরিকল্পনা` | `88e4a430-c29f-4bfa-b810-7a2ce42379be` | DELETED |
| 4 | Notice `EVAL2-xss নোটিশ` (duplicate from a crashed script run) | `1106d13d-d1b0-478c-81b9-39f37394eece` | DELETED |
| 5 | Notice `EVAL2-xss নোটিশ` | `7a95efec-6ab9-4a7b-a249-d34861ebb171` | present |
| 6 | Homework `EVAL2-xss বাড়ির কাজ` | `f7274f60-0295-4fcc-9e93-9479a94186f9` | present |
| 7 | Homework `EVAL2-HW গতকাল` (due 10-05) | `65206d1a-f40a-4528-957a-0a6693aa663a` | present |
| 8 | Homework `EVAL2-HW আজ` (due 10-06) | `70a8f3bd-f47f-432f-a30b-2b050d160af9` | present |
| 9 | Homework `EVAL2-HW দুই দিন` (due 10-08) | `0f60ae14-eaa2-4e63-87fc-f4102a3d8f4d` | present |
| 10 | Homework `EVAL2-HW তিন দিন` (date cleared in the edit test) | `bc72dc5c-1709-4777-920d-f667f6668a62` | present |
| 11 | Homework `EVAL2-HW তারিখ নেই` | `abdd8ca5-8352-4275-8bd5-890605df9722` | present |
| 12 | Homework `EVAL2-HW refused impossible` (published undated when my bypass of the date input failed) | `e9312abf-db11-43a7-9718-a88144b436ea` | present |
| 13 | Question `EVAL2-xss প্রশ্ন` by the EVAL2 student, subject UXA-Acad Eng | `ba6fed75-5bbe-41ca-b2ff-65de24d3b48f` | present — database only (no delete in the app) |
| 14 | Exam `EVAL2-পরীক্ষা` (2026), class UXA-Att, 2 routine papers (20, 21 Oct), one mark (75, my student) | `8ee1c038-9663-4051-b4f2-799202d32556` | present — delete on the exam page |

All publications target the exact class offering `UXA-Att 1790996221552 - A`. No SMS sent (0 `sendCompose` calls), no payment
recorded, no exam closed or published, no DEMO record edited.

## Part 1

### 1.1 Structure
- HEAD `8d903dd`; `origin/staging` `4e6f955` is an ancestor (`git merge-base --is-ancestor`).
- `git diff --name-status origin/staging..HEAD -- web/supabase/migrations` → only `A 0214_student_attendance_summary.sql`
  (two functions + revoke/grant execute; no policy statement). No RLS/policy file changed.
- Removed exports since `b40c47b`: `DayPlanCard`, `FeesDue`, `LatestNotices` (old student home pieces) — 0 references left in
  `app`, `components`, `lib`, `e2e`, `tests`. `ProgressBar` only gained props. No file under `web/` deleted or renamed. No i18n key removed.
- Removed root paths (`ui/`, `index.html`, `figma/`, `handsoff/`): root tree is `.gitignore CONTEXT.md "Design System" README.md docs
  graphify-out home.yml routes.txt web`; in `web/` they are named only in code comments; no `.github` workflow reads them.

### 1.2 Server-side changes
Exactly two `'use server'` files changed; no `*-source.ts` changed.
- `app/school/notices/actions.ts`: `PublicationInput.dueDate?`; `due_at` written through `publicationDueAt` (`lib/publishing.ts`).
  Homework + date → `YYYY-MM-DDT23:59:59+06:00`; homework + '' → null; `dueDate` undefined → column left out;
  **any non-homework kind now always writes `due_at: null`** (an old non-homework row with a due date loses it on edit — none can be
  created through the app). Malformed / > 2 years ahead → `{ error }`. `publications.due_at` exists since migration 0140.
- `app/school/exams/[id]/marks-entry/actions.ts`: `Number(toLatinDigits(x))` for the three components; `markCellError` (`lib/exam-setup.ts`) does the same.
  Stored values for Latin input unchanged.
- Nothing unexpected.

### 1.3 Shared components on owner pages — PASS
23 owner pages × {1440, 390} × {light, dark}, Bangla: 91 of 92 loads status 200, 0 console errors, 0 horizontal overflow, theme applied
(the one miss was my probe reading `/school/attendance` mid-redirect). Screenshots looked at: dashboard dark, employee attendance calendar light,
notice form dark at 390. `app-shell.tsx` not changed in range.

### 1.4 Dialogs — PASS, one regression found and fixed
- Add Subject modal (`/school/classes?tab=subjects`; 1440, 390, 390 dark): centred, unclipped (576×350 / 358×630), focus in and back to the trigger,
  combobox popup renders inside the dialog and an option can be picked (`class_id` set), Escape with the popup open closes only the popup,
  backdrop closes, Back with it open leaves nothing open/inert. Not submitted.
- Student question popup + follow-up editor (1440, 390): centred, scrolls on phone; Tab in a fenced block indents and keeps focus; first Escape
  in a fence does not close; Escape / backdrop / double Escape close once; Back closes, Forward reopens; focus returns to the row link.
  **D-1 (regression, fixed `e6ace1e`)**: direct load of `/student/questions?view=<id>` logged "Switched to client rendering because the server
  rendering errored: document is not defined" — `components/native-dialog.tsx` read `document` for the toaster theme during render.
  After the fix: 0 errors and the SSR HTML contains the dialog. Test `tests/unit/native-dialog-ssr.test.tsx` failed before, passes after.
- Notice drawer + delete confirm (1440, 390): confirm centred above the drawer; ONE Escape closes only the confirm; second closes the drawer;
  Back leaves no inert/aria-hidden/scroll lock. Double click on confirm → second click refused, exactly 1 `deletePublication` in the dev log.
  Delete toast visible in the page toaster right after the dialog closes.
- Exam route modal on `EVAL2-পরীক্ষা`: comboboxes inside work; Delete confirm inside it — ONE Escape closes only the confirm, form intact;
  publish confirm lists ০/১৪ complete, ✗ bands, ✗ marks, confirm button disabled; cancelled.
- SMS confirm (bn 1440/390, en 1440; POSTs blocked): "প্রাপক: ১১ · অংশ: ১ · ১১ × ১ = ১১ · ব্যালেন্স: ৭১,৫৪৩" = the page's own numbers; cancelled; 0 sends.
- Student drawer, employee drawer, employee attendance route modal: sized and scrollable, Tab stays inside (only Base UI's focus guard / browser UI
  between cycles), Escape and Back clean. Older note: the employee drawer returns focus to `body`.
- Toast vs dialog (toast fired through the page's own sonner): fired before open → shown inside the dialog; fired while open → visible, action
  button clickable (handler ran); after close both visible on the page. Action button is 98×24 px.
- Observation: Escape with a typed follow-up draft (outside a code fence) closes the popup and discards the draft without asking.

### 1.5 Security — PASS, one sibling defect fixed
- Markdown: payload with `<img onerror>`, `<script>`, `[x](javascript:…)`, `[y](data:…)`, `<a href="javascript:…">`, `![img](https://example.com/x.png)`,
  `<iframe>` in a student question and in an owner notice, homework and lesson plan. Viewed at: ask-form preview; student questions list and popup
  (click + direct); notices list and detail; tasks list and detail; materials preview; home; notifications; owner inbox list and drawer; owner notice
  list, drawer, detail, edit; homework drawer and detail; class teacher's inbox and notices — at 1440 and 390. Everywhere: 0 `script`, 0 `iframe`,
  0 `img`, 0 inline handlers, 0 `javascript:`/`data:` hrefs, 0 alert dialogs, 0 requests to example.com. Raw HTML shows as text; previews are plain.
- Login: JS off → `method="post"`, button disabled. JS on → 43 URLs recorded during login, none with `password=`; Enter before hydration does nothing.
- **Fixed `78ff910`**: `app/super-admin/gov-officials/create-gov-form.tsx` and `app/super-admin/partners/create-vendor-form.tsx` had password inputs and
  no `method` (code observation, not browser-checked — no super-admin session used).
- Dev only: Next's dev log prints server-action arguments, including passwords.

### 1.6 Checks
- `npx tsc --noEmit -p .` clean. `npx vitest run tests/unit`: 153 files, 1711/1711 at `8d903dd` (+1 file/+1 test with my fix).
- `npx eslint .`: 10 errors, 9 warnings — `app/claim/page.tsx:33` (same code on `origin/staging`) and 9 × rules-of-hooks in `e2e/fixtures/roles.ts`; none from this range.
- Weak tests: `student-nav.test.ts` "has the five groups in tab order" / "orders items…" restate the constant table.
  Untested logic: the Bangla-digit lines in `saveMarks`; `due_at` wiring in `publicationColumns`; `phone-rows.tsx` selectors; `login-form.tsx` ready state.

## Part 2 (done so far)

- **B. Student home — PARTLY** (EVAL2 student in the DEMO class + seed student; not the DEMO student). Rows in order red, red, amber, amber, blue:
  overdue homework (earliest named, "+২"), urgent notice, due within 2 days, exam soon (8 Oct), new notices. Cards: attendance "—" muted, fees "—" muted,
  homework ১৭ red with pulse and "৩ টি সময় পেরিয়েছে", result "—". Quick actions (5). Today's routine = the manifest's Tuesday slots. Upcoming by date.
  Seed student: worded empty states, no pulse. Not seen: fee-due row/card, attendance-low row/card, bars.
  The manifest lists 3 exam papers; owner and student both show only 8 and 11 Oct.
- **C. Homework due date — MET.** States on the tasks page and home correct for yesterday / today / +2 / +3 / none; owner list and detail show the date;
  edit prefilled; edit to a past day → overdue; "তারিখ মুছুন" → undated/later; no due field on any other kind; 2030-01-01 refused
  "জমার তারিখ দুই বছরের বেশি পরে হতে পারবে না". An impossible date cannot be sent from the browser (native date input) — unit test only.
- **J. Fees — PARTLY.** Owner record list: DEMO row "পরিশোধ ৳০ · বকেয়া ৳৫০০ · বকেয়া". **D-2 confirmed**: with the class picked, the "ফি আদায়" roster
  shows the same student as "আদায় হয়েছে" — `app/school/fees/page.tsx:319-320`, `recordMap.has(s.id) ? fees.collected : fees.notCollected`
  (record exists ≠ money received). Older (2026-09-26). Not fixed: label is a wording decision. Student side not checked.
- **K. Animations — MET for what has data.** `ui-rise` 0.45s on alert strip and stat grid; `ping` on overdue row, urgent-notice row, overdue homework card,
  owner approvals row; none on muted/blue cards or for the seed student; all off under reduced motion; layout shift 0.04–0.06.
- **L. Owner regression (part).** Exam: create → class + scheme → routine (overlap refused "এই সময়ে একই শ্রেণির আরেকটি পরীক্ষা আছে", end-before-start refused)
  → marks ("১০১" refused, "abc" refused, "-5" refused, "৭৫" saved as 75, 13 other cells still empty after reload) → result book ("নম্বর দেওয়া হয়নি",
  "৭৫ / ২০০ · অসম্পূর্ণ") → publish dialog disabled, cancelled. Class teacher on another class's exam: banner "এই পরীক্ষাটি আপনার শ্রেণির নয়…", all fields disabled,
  no Save; marks page 0 cells with the misleading text "এই শ্রেণিতে কোনো শিক্ষার্থী নেই"; mark unchanged. Server-side refusal not exercised directly.
  On her own class's exams the teacher can edit setup, enter marks, and sees unpublish / delete / close; a class-less exam is open to her.
  Staff user → permission-denied page. SMS confirm numbers ✓. Notice create / edit / delete ✓.
  Bangla leftovers: marks page title "(2026)", rolls, "তত্ত্বীয় (100)", totals; routine times "09:00 - 11:00"; my-classes "শিক্ষার্থী সংখ্যা: 1".

## Rebuilt here — findings from 2026-10-07 on

### L (rest). Owner regression — MET (browser, 2026-10-07)
- Leave: the EVAL2 student applied (25–26 Oct, "EVAL2-ছুটি পরীক্ষা") on a phone; student list shows it "অপেক্ষমাণ · দিন ২" with "আবেদন ফিরিয়ে নাও".
  Owner `/school/attendance/leave/student?q=EVAL2` at 390px: row buttons "অনুমোদন" 82×44 and "প্রত্যাখ্যান" 81×44. Reject → confirm
  "এই ছুটির আবেদন প্রত্যাখ্যান করবেন? | বাতিল | প্রত্যাখ্যান" → cancelled, row still pending. Approve → row "অনুমোদিত", toast "ছুটি অনুমোদিত হয়েছে" with
  "পূর্বাবস্থায়"; clicked it → after reload the row is "অপেক্ষমাণ" again. 0 console errors.
- Fee form overpayment guard (EVAL2 student row → "আদায় করুন"; POSTs blocked in the test browser, 0 attempted): fee 500 / received 200 → "প্রদেয় মোট ৳৫০০",
  "বকেয়া ৳৩০০"; received 600 → warning "প্রদেয় মোটের চেয়ে বেশি নেওয়া হচ্ছে: ৳১০০"; "রসিদ দেখে নিন" → review step adds "অতিরিক্ত টাকা এই মাসের রেকর্ডেই জমা থাকবে —
  পরের মাসের ফি-তে নিজে থেকে সমন্বয় হবে না।" and a checkbox "হ্যাঁ, অতিরিক্ত টাকা অগ্রিম হিসেবে নিচ্ছি"; "নিশ্চিত করুন ও রসিদ ছাপুন" stays DISABLED until it is ticked.
  Nothing saved.
- Employee search: "Staging Teacher" → URL `?q=Staging+Teacher`, 10 rows → 2 (Staging Teacher One / Two); nonsense → 0 rows, "এই খোঁজে কোনো কর্মচারী মেলেনি".
- Exam delete: confirm "পরীক্ষা মুছে ফেলবেন? … রুটিন, আসন বিন্যাস, নম্বর … সবকিছু একসাথে মুছে যাবে। বন্ধ করা পরীক্ষা মোছা যায় না।" → deleted, back on the list, gone from it;
  the old URL shows the 404 page. Notes: no toast after an exam delete; the 404 page answers HTTP 200 and addresses the owner informally ("এসেছ", "ফিরে যাও").
- LEDGER: exam `EVAL2-পরীক্ষা` (#14) **DELETED** with its 2 routine papers and the mark. New #15: leave request 25–26 Oct "EVAL2-ছুটি পরীক্ষা" by the EVAL2 student,
  pending — to withdraw at the end.

### A. Student shell — MET (browser, EVAL2 student, 390 and 1440, Bangla)
- Phone: 5 bottom tabs হোম | পড়াশোনা | পরীক্ষা | হাজিরা | ফি, each 78×56; `aria-current=page` on the right tab for home, routine, results, attendance, leave, fees
  (profile and notifications: none active, as designed). On the five list pages my probe picked the pager instead of the tab bar, so the active tab there
  was not measured on the phone; the sidebar check below covers the mapping.
- Desktop: sidebar groups সংক্ষিপ্ত, পড়াশোনা, পরীক্ষা ও ফলাফল, উপস্থিতি ও ছুটি, ফি; the right group is expanded and the right item `aria-current` on all 11 menu routes.
- Brand "T / Test School A / শিক্ষার্থী পোর্টাল". Avatar menu: name, "প্রোফাইল", "লগআউট". First focusable element and first Tab stop: "মূল অংশে যাও" → `#app-content`, visible on focus.
- All 13 URLs (12 old + notifications) answer 200 with their own title and h1, 0 console errors, 0 horizontal overflow at both widths.

### D. Student lists — MET (browser; EVAL2 student, plus seed student for results and fees)
| List | Search | Filters (URL) | Paging | No match |
|---|---|---|---|---|
| tasks | `q` (7 EVAL2 rows) | state: default open / overdue 5 / dueSoon 1 / later / done 0 / all 17 | `page=2` "দেখাচ্ছে ১১–১৭ / ১৭", `size=20` → 17 | "কোনো ফলাফল নেই" + clear link |
| notices | `q` | read: unread 8 / read 1; importance: normal 7 / important 0 / urgent 2 | size | same |
| leave | `q` | status: pending 1 / approved 0 / rejected 0 | size | same |
| exams | `q` | exam; when: upcoming 2 / past 0 | size | same |
| materials | `q` | kind: lesson_plan 1 / exam_prep 1 | size | same |
| questions | `find` | none (search only) | size | same |
| results (seed) | `q` | year filter only when more than one year exists (code `results/page.tsx:112`) — not shown for 1 row | size | 0 rows |
| fees (seed) | `q` | status: বকেয়া / জমা | size | 0 rows |
- Counts agree with the dates on 2026-10-07 (overdue 5 = three DEMO + two EVAL2 past days; due soon 1). URL always reflects the state. 0 console errors.
- Shortcuts at 1440: "/" focuses the search box on every list with rows; "F" focuses the filter (lists that have one).
- Phone rows: tasks and notices at 390 and 639px = one list of rows 56–57px high (6 tasks / 5 notices above the tab bar), no table; at 640 and 768px the table and no phone list.
  DataTable's own cards are hidden (0 visible). No overflow.
- With no rows at all (EVAL2 student's results and fees) there is no search bar — only the empty state.

### E. Questions — MET after one fix (browser; EVAL2 student, owner, seed student)
- Toolbar on a selection ("beta" in "alpha beta\ngamma"): মোটা → `**beta**`, বাঁকা → `*beta*`, বড়/মাঝারি শিরোনাম → `## ` / `### ` on the line, বুলেট → `- `, ক্রমিক → `1. `,
  উদ্ধৃতি → `> `, ইনলাইন কোড → `` `beta` ``, কোড ব্লক → fenced block with blank lines around, লিংক → `[beta](https://)` with the URL selected. Focus stays in the textarea each time.
- **DEFECT D-3 (in range, `843edf1`; FIXED in `db69a5b`):** the stored question did not render like the preview. Preview: `p > strong, em, br` and tight lists;
  timeline: every single line break a new `<p>`, every list item wrapped in `<p>`. Cause: a textarea posted in a form arrives with CRLF; `softBreaksToHard`
  (`web/lib/rich-text.ts:64`) split on LF only, so `\r` + the two added spaces read as a blank line. It also changed OLD plain multi-line questions and replies
  (line breaks became paragraphs). Affected: student questions, follow-ups and teacher replies (all sent as FormData); not notices/homework (sent as JSON).
  After the fix the timeline's element list is identical to the preview's (`h3,p,strong,em,br,ul,li,li,ol,li,li,blockquote,p,p,code,pre,code,p,a`). Unit test added (failed before).
- Follow-up from the popup: sent, appears as a second "প্রশ্ন" step, "প্রশ্ন পাঠানো হয়েছে।"; the list keeps ONE row for the conversation, message count ২.
- Owner replied from the inbox drawer (editor with formal labels "লিখুন", "আপনার উত্তর", hint "… চাপুন") with bold, a numbered list and inline code: student row becomes
  "শিক্ষকের উত্তর · ৩", popup shows "শিক্ষকের উত্তর · ৭ অক্টো ২০২৬, ৯:০৯ PM" rendered as `p,strong,ol,li,li,p,code`.
- Old plain question (seed student, "E2E question 1789977634963"): question and reply each one plain `<p>`.
- Notes: the owner's inbox lists the question and its follow-up as two rows (known, #703 5.4) with a plain-text preview; the submit button there reads "উত্তর দাও"
  (informal) beside formal labels; no toast after a reply.
- Undo: Cmd+Z after a toolbar action gave `alpha **beta**alpha [beta](https://)\ngamma` in my scripted sequence (text from an earlier fill re-appeared) — toolbar edits are
  not in the browser's undo stack, so undo after one can corrupt the text. Known limitation in the handoff; not fixed (needs `execCommand`/`setRangeText` design choice).
- LEDGER #16: question `EVAL2-ফরম্যাট প্রশ্ন` + one follow-up by the EVAL2 student, answered by the owner — database only to remove.

### F. Rich text on notices / homework — MET (browser)
- Owner form: label "বিস্তারিত বিবরণ", tabs "লিখুন | প্রিভিউ", hint "… Tab চাপুন।" (formal), 10 toolbar buttons with Bangla names. Edit page loads the stored Markdown (seen in C).
- Stored "EVAL2 body **bold** + 2-item list": owner detail, owner drawer and student task detail all render `p,strong,ul,li,li`, no raw `**`.
  DEMO formatted notice (read only): owner detail and student detail both `h3,ul,li,li,strong,pre,code,p,a`.
- Previews are plain: student materials list, tasks list, notices list, owner notices list, teacher my-classes — no `**` or `](` anywhere.

### G. Calendars — MET with two notes (browser, 1440 and 390)
Employee attendance calendar, off-day/leave calendar, one employee's own calendar, student attendance calendar:
- each 35 cells, one cell height per width: 112px desktop, 64px phone; weekday header রবি … শনি; today in a filled circle; state chips on desktop
  (36 / 12 / 7 / 10 chip texts), none on phone (dots where a day has a state); no overflow, 0 console errors.
- Fri/Sat columns tinted on all four. Student calendar marks the weekly off-days with "ছুটির দিন" chips: 10 chips = stat card "ছুটির দিন ১০" (5 Fridays + 5 Saturdays in Oct 2026).
- Note 1: `aria-current="date"` is set on today's cell only in the employee-own and student calendars (`employee-own-attendance.tsx:96`, `student/attendance/page.tsx:198`);
  the employee attendance calendar and the off-day calendar draw the circle but do not expose "today" to assistive tech.
- Note 2: the two owner overview calendars draw weekly off-days with a red hatched pattern, the other two with the plain tint + grey chip — same grid, slightly different off-day look.
- Values vs cards with real attendance: NOT CHECKED (my student has no attendance; the DEMO student could not be opened).

### H. Attendance figures for the DEMO student — NOT CHECKED
Needs the DEMO student's login (password file wiped). I did not mark attendance for my own student because saving a day writes rows for the whole DEMO class.
Seen instead: a student admitted after the marked days (my EVAL2 student, class marked on 4 and 5 Oct) gets "—" rate, "উপস্থিত ০", "অনুপস্থিত কার্যদিবস —" and the banner
"এই মাসে স্কুল এখনো হাজিরা তোলেনি।" — the page cannot tell "class not marked" from "no row for me" (known, #703 item 4.4).

### I. Results — MET (seed student, 1440 and 390); DEMO empty state seen through the EVAL2 student
- Seed list row "UAT3 Exam 177343 · ২০২৬ · ৭২ / ১০০ · সম্পূর্ণ". Detail: notice "গ্রেড এখনো দেখানো যাচ্ছে না, নম্বর নিচে দেওয়া আছে।", "মোট নম্বর ৭২ / ১০০", "মেধাক্রম ১ / ১",
  subject table "XS1 Physics ৭২ / ১০০". No grade/GPA value, no print link (0), only breadcrumb/tab links. 0 console errors, no overflow.
- No-result student: "এখনো কোনো ফলাফল প্রকাশ করা হয়নি। পরীক্ষা শেষে স্কুল ফলাফল প্রকাশ করলে এখানে দেখতে পাবে।" No-fee student: "কোনো ফি রেকর্ড নেই।"

### M. Formats — PARTLY (browser text scan of `main`; names/ids with digits ignored)
- Student portal, Bangla: all 13 pages + seed results/detail/fees/profile — no Latin digit, dates all "৫ অক্টো ২০২৬" style, money "৳৫০০".
- English: 5 owner + 5 student pages — no Bangla digit. Grouping locale is `bn-BD` / `en-IN` (`lib/i18n.ts:3708`): 12,34,567 / ১২,৩৪,৫৬৭.
  No amount of 6+ digits was on screen to see lakh grouping in a page.
- Owner portal, Bangla — clean: students, fees, notices, attendance/mark, leave/student, off-days, attendance/employee, sms, classes, result book.
  Leftovers (page → text):
  - `/school` → quick-action badge "343" (the alert row beside it says "৩৪৩").
  - `/school/exams` → class labels with a Latin year "… — 2026"; same label in class pickers ("UXA-Att … — 2032").
  - `/school/exams/<id>/marks-entry` → title "(2026)", roll numbers, "তত্ত্বীয় (100)", "এমসিকিউ (0)", totals ("72").
  - `/school/exams/<id>/routine` → times "10:00 - 12:00" (12-hour format is an open decision).
  - `/school/classes/routine` → period numbers 1–8.
  - `/school/employees` → "মেশিন আইডি 229" (an identifier; arguably fine).
  - `/school/my-classes` (teacher) → "শিক্ষার্থী সংখ্যা: 1".

### N. Accessibility basics — PARTLY (browser, 390px; 13 student pages + owner /school, /school/fees, /school/notices)
- Unlabeled inputs: none found. (The only nameless controls are the comboboxes' arrow buttons, which are `tabindex=-1 aria-hidden`.)
- Page titles: every student page and the three owner pages have their own `<title>` and one `h1`.
- Focus visibility: first 10 Tab stops inside `main` on every page have an outline or ring.
- Tap targets under 44px at 390px (size w×h):
  - every student page except home: breadcrumb "হোম" 25×20; owner: breadcrumb "ড্যাশবোর্ড" 54×20;
  - filter comboboxes 274×42 (notices, tasks, materials, exams, leave, questions subject picker, profile; owner fees ×4, notices ×2);
  - student attendance: link "ছুটি →" 38×20; student profile: correction input 308×36, button "সংশোধনের অনুরোধ" 154×32;
  - owner fees: "বকেয়া তালিকা ও তাগাদা →" 155×20; owner notices: "দেখুন →" 49×20 and row link 42×44 wide;
  - toast action button 98×24 (from P1.4).
  Home dashboards (student and owner): none.
- Dark-mode contrast (computed for all text in `main` with a solid background): everything ≥ AA except the muted outside-month day numbers on the
  student calendar (2.68:1, `text-muted/50`, decorative and `aria-hidden`).
- `aria-current="date"` missing on two owner calendars (see G).

### O. Docs and repo — MET with one note
- 98 Markdown files, 301 relative links checked. `docs/README.md`: all links resolve. `README.md` and `CONTEXT.md`: no mention of `ui/`, `index.html`, `figma/`, `handsoff/`.
- Removed paths are named only as history: `docs/README.md:7` (retired prototype note), `docs/adr/0006`, `docs/_revamp/inventory.md`, the handoff / plan / cleanup records, the student audit.
- Note: `docs/research/2026-08-29-bangladesh-market-compliance-gap-analysis.md` has 10 links written as absolute paths on the author's machine
  (`/Users/salmansakib/Documents/Projects/Amar_school_LMS/...`) — they work nowhere else. Older file, only moved into version control by the docs revamp.

### Cleanup (2026-10-08, through the app)
- Leave request withdrawn by the EVAL2 student ("কোনো ছুটির আবেদন নেই।").
- All 8 remaining EVAL2 publications deleted (owner list shows none). Exam deleted earlier.
- Student `EVAL2-শিক্ষার্থী পরীক্ষক` archived ("পুরাতন শিক্ষার্থী"; 0 rows in the active list).
- LEFT BEHIND (no removal in the app): the archived student row and its login `s9293@sch3d5b6aaf.students.invalid`; three question rows by that student
  (`EVAL2-xss প্রশ্ন`, `EVAL2-ফরম্যাট প্রশ্ন` + one follow-up, one of them answered by the owner) and whatever notifications those created.
