# #704 fixes (UI defects)

## Fixed
- `aria-current="date"` on today in the Employee Attendance Calendar and the Leave Calendar: 81a3fef5
- Employee daily table reads "Not in yet" (existing key `employees.notInYet`) for a no-record employee on today: 81a3fef5
- Per-employee attendance page: Latin digits in the stat cards, raw ISO dates under Recent Leaves (`localizeNumber`, `formatDate`): e475d128
- Student withdraw drops `?view=<id>` from the address: ff2a1522
- Owner question reply toast (reuses existing `questions.replied`): ff2a1522
- Owner inbox: a reply on a follow-up marks the earlier unanswered messages of that thread as answered (derived in `supersededMessages`, nothing stored; unit test added): d08dd6b2
- Marks popup keeps `?from=` on subject switch: e49d5a86
- Toast action button 44px high at phone width: e09f9060

## Already fixed before this pass (checked, no change needed)
- Breadcrumb tap area (`Crumbs` has a 44px pseudo hit area), filter comboboxes (`FIELD_HEIGHT` is 44px on phones), StatCard link, leave tabs/dates, mark-form "on leave" count, off-day year heading.

## Not fixed
- Voided receipt does not show who voided it, receipt "In words" in Bangla: both in `web/app/school/fees/receipt/**`, a path this pass must not touch.
- Escape discards a typed follow-up draft: needs a new confirm sentence (see wording).
- Toast after exam delete: no existing "exam deleted" string (see wording).
- Other tap targets (student attendance month links, profile correction input and button, 12/27 exam setup controls, student leave Approve/Reject, staff page): not located or measured; need a browser pass.
- "Absent" on mark sheets (needs a view change); Cmd+Z in the rich text editor; exam guard `app_class_scope`; Escape closing two layers; toasts under a dialog.

## Needs wording decision
- Rejected leave: owner "প্রত্যাখ্যাত" vs student "নামঞ্জুর".
- Fee roster "আদায় হয়েছে" (Collected) at 0 received.
- "No record" wording; disabled-login message.
- Exam-deleted toast: proposed bn "পরীক্ষাটি মুছে ফেলা হয়েছে" / en "Exam deleted".
- Discard-draft confirm: proposed bn "লেখা ফলো-আপ সংরক্ষণ করা হয়নি। বন্ধ করলে মুছে যাবে। বন্ধ করবেন?" / en "Your follow-up is not sent. Closing will discard it. Close anyway?"

## Needs migration
- A student admitted today is counted absent on earlier days (already in #703).
- Absent on mark sheets / student rank counting incomplete results / progress report hiding a half-filled subject (view changes).
