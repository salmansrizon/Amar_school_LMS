# Wave 2 browser test: attendance and access

Tester: browser agent, 2026-10-08. Code: `merge/staging-sync` at `2e930672`.
App: `next dev --webpack` on port 3741 against the shared database, Test School A.
Every record created is prefixed `W2-ATT`. Appended after each item.

## Records created

- Staff login `W2-ATT office` (`w2att-office@test.local`), no employee record.
- Employee `W2-ATT emp` (Teacher, joining date 6 Oct 2026, machine id 1846) with a
  linked staff login `W2-ATT emp` (`w2att-emp@test.local`), made from the New Employee form.
- Students `W2-ATT Student One` (roll 93, S9297) and `W2-ATT Student Two` (roll 94, S9298)
  in class `UXA-Att 1790996221552 - A` (the only class of the active year).

## Findings

### #690 duplicate roll: VERIFIED

Owner, student profile of `W2-ATT Student One`, Edit, roll changed 93 -> 94 (Student
Two's roll), Save. The form stayed open and showed, in red above the buttons:

- bn: "এই শ্রেণি ও শাখায় এই রোল নম্বর আগেই ব্যবহার করা হয়েছে। অন্য রোল দিন, অথবা ফাঁকা রাখুন।"
- en: "That roll number is already used in this class and section. Pick another, or leave it blank."

After a reload the roll was still 93. Saving the same form with the roll untouched
closed the form with "শিক্ষার্থীর প্রোফাইল সংরক্ষিত হয়েছে" / "Student profile saved".
Seen at 1440px (bn) and 390px (en).


### #680 leave rejection reason: VERIFIED

Records: student leave `W2-ATT leave A` (12 Oct 2026, rejected) and `W2-ATT leave B`
(13 Oct 2026, left pending) for `W2-ATT Student One`; employee leave
`W2-ATT emp leave A` (14 Oct 2026, rejected) for `W2-ATT emp`; a student login for
`W2-ATT Student One` (S9297).

- Owner, Student Leave Management, row "Request Leave" on `W2-ATT Student One`: two
  requests created, both listed Pending.
- Reject on leave A opened "Reject this leave request? / Reason for rejection
  (optional) / The requester will see this." Typed `W2-ATT reason: exam week`, Reject.
  The row became Rejected with "Reason for rejection: W2-ATT reason: exam week" under
  the leave reason. Details drawer: "Decided on 8 Oct 2026", "Reason for rejection
  W2-ATT reason: exam week" (bn: "সিদ্ধান্তের তারিখ ৮ অক্টো ২০২৬", "প্রত্যাখ্যানের কারণ ...").
- Approve on leave B: toast "Leave approved / Undo"; row Approved; drawer showed
  "Decided on 8 Oct 2026". Clicked Undo: row back to Pending with Approve/Reject, and
  the drawer no longer has a "Decided on" line.
- As the student (S9297): home shows the alert "ছুটির আবেদন নামঞ্জুর হয়েছে / ১২ অক্টো ২০২৬"
  ("Leave request rejected / 12 Oct 2026"). Leave page row: "কেন নামঞ্জুর হয়েছে: W2-ATT
  reason: exam week", status "নামঞ্জুর", "সিদ্ধান্ত হয়েছে ৮ অক্টো ২০২৬" (en: "Why it was
  rejected: ...", "Rejected", "Decided on 8 Oct 2026"). Leave B shows Pending with Withdraw.
- Employee leave: same dialog; row shows "Reason for rejection: W2-ATT reason:
  staffing"; drawer shows "Decided on 8 Oct 2026" and the reason.
- 1440px and 390px, bn and en: no horizontal overflow on the owner list, the drawer,
  the student home and the student leave page.

Wording note, not changed: the owner pages say "প্রত্যাখ্যাত / প্রত্যাখ্যানের কারণ", the student
pages say "নামঞ্জুর / কেন নামঞ্জুর হয়েছে" for the same state.

### Weekly off-days (0218/0250/0251): VERIFIED

Test School A shows Friday and Saturday as off-days on the student calendar.

- `W2-ATT Student One`, October 2026: Fri 2, Sat 3, Fri 9, Sat 10, ... are "ছুটির দিন"
  (Holiday), "Holiday 10". "Absent working days 2": Sun 4 and Mon 5, the two days the
  class has marks. Thu 1, Tue 6, Wed 7 (class not marked) are blank. Home card:
  "0% / 0 / 2 days present". So the percentage is over the 2 marked days and no
  Friday or Saturday is counted.
- Seed student S9001 (class never marked this month): "—", "The school has not taken
  attendance this month yet.", absent working days "—", Fridays and Saturdays Holiday.
- 1440px and 390px, bn and en: no horizontal overflow.

Observation, not part of this item: `W2-ATT Student One` was admitted on 8 Oct and is
counted absent on 4 and 5 Oct, before admission, so a student admitted today lands on
"Attendance is low this month 0%". Not fixed.

### #689 approvals scoped: PARTLY

Records: student leave `W2-ATT leave C by student` (15 Oct 2026, pending), made by the
student login; the Attendance grant on `W2-ATT office`.

- Owner: `/school/approvals` "Total: 343", 3 workflow types (Leave Approval,
  Attendance Correction and one more); dashboard "343 approvals pending".
- `W2-ATT office` with no grant: `/school/approvals` "Total: 0 / No pending approvals";
  the dashboard has no "Needs attention" approvals line.
- `W2-ATT office` after the owner granted Attendance (Staff drawer, Attendance ->
  "Granted"): "Total: 342", 2 workflow types; dashboard "342 approvals pending". One
  fewer than the owner: the item of the third workflow type is not shown.
- Teacher fixture `teacher-e2e@test.local` (employee record, holds the Attendance
  grant): "Total: 0 / No pending approvals", no approvals line on the dashboard.
- 390px bn, owner and office: same totals (৩৪৩ / ৩৪২), no horizontal overflow.

Not seen: a teacher seeing an approval they started or can decide. No screen starts
a workflow instance: the leave requests made today by the owner and by the student did
not change the owner's 343 (the queue is `workflow_instances`, newest row 3 Oct, and
`workflow_start` is only called from `web/lib/engines/workflow/engine.ts`). So the
teacher's "own" case could not be produced from the browser; the 0 is consistent with
the rule but does not prove the positive half.

### #693 attendance start for non-owner roles: VERIFIED (with a limit)

Records: the Employees grant on `W2-ATT office` (added so the per-employee page opens;
Attendance was granted under #689).

Compared the owner with `W2-ATT office` (staff login, no employee record, Attendance
grant). The two saw the same thing on every screen:

- Employee Attendance calendar, July 2026: 7 July (the only day in June-October with
  any employee record) reads "100% 5/5" in both roles. The school has 11 active
  employees; the 6 who started later, `W2-ATT emp` among them, are not counted absent.
- Table, date 2026-07-07: 5 rows, all Present 07:50-14:10; no row for `W2-ATT emp`
  or the other later joiners, in both roles.
- Table, dates 2026-10-05 and 2026-10-06: 10 rows, no `W2-ATT emp`. Date 2026-10-08:
  11 rows, `W2-ATT emp` present in the list ("No record"). Both roles.
- Per-employee page of `W2-ATT emp` (office needed the Employees grant; without it
  the page is "Permission denied"): July 2026 every cell blank including 7 July,
  "Absent days 0"; October blank up to 7 Oct, 8 Oct "No record". Both roles.

Limit: the start day is the later of the joining date and the day the record was
created (0220), so `W2-ATT emp` (joining date 6 Oct, created 8 Oct) starts on 8 Oct,
not 6 Oct. And because no past day except 7 July has any record, no "Absent" status
appeared anywhere, so "blank instead of absent" was seen as "not listed / not counted
on a recorded day", not as a blank cell next to another employee's Absent cell.

### #694 no-record state: VERIFIED

- Calendar (owner and office, bn and en): past working days with no employee record
  read "No record" / "কোনো রেকর্ড নেই" with no rate (1, 4-8 Oct; every working day of
  June, August, September; July except the 7th). Fridays and Saturdays read
  "Holiday / Off Day".
- Daily table: 2026-10-05, 10 rows, each "No record" (one "On Leave"); none "Absent".
- Per-employee page of an existing employee (Staging Teacher One, read only): July
  shows "7 07:50-14:10" and "No record" on the other working days, off-days as
  "Holiday / Off Day"; "Absent days 0".
- Employees directory today: every row "Not in yet" / "এখনো আসেননি".
- The warning "The attendance machine has not synced for this day yet..." did not
  appear on the calendar, the table, the per-employee page or the directory, in
  either role or language.
- 1440px and 390px: no horizontal overflow.

Notes, not fixed:
- Today in the daily table reads "No record" for everyone while the directory reads
  "Not in yet" for the same day (the open question in the issue).
- Per-employee page in Bangla: "অনুপস্থিত দিন 0 / ছুটির দিন 0" use Latin digits, and
  "Recent Leaves" prints raw ISO dates ("2026-10-14 – 2026-10-14") in both languages.
- At 390px the calendar cells carry only dots: off-days have a red dot, a recorded
  day a green dot, a no-record day no dot and no text.
