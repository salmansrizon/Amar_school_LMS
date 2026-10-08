# Attendance & Leave UX audit
(started; prior agent left scripts only)

## Survey (owner, desktop, bn) — raw notes
- S1 /school/attendance redirects to /school/attendance/mark; first load 13.3s (dev compile). Landing shows "275/278 present", absent 3 ("আজ অনুপস্থিত ৩").
- S2 Today is Sat 2026-10-03 = weekly off (calendar shows ২,৩ ছুটির দিন) yet student mark page offers "সকলকে উপস্থিত করুন" with no holiday warning (to verify).
- S3 Sub-nav pills on employee/grace/office-hour/leave-employee: অফিস আওয়ার | গ্রেস টাইম | কর্মচারী উপস্থিতি | ছুটি ব্যবস্থাপনা. Grace-time + Machine pages show NO breadcrumb (others show ড্যাশবোর্ড › পাঠদান ও অ্যাকাডেমিক › উপস্থিতি › ...). Pill labels "ছুটি ব্যবস্থাপনা" is the same label in student and employee groups.
- S4 Machine page lists many leftover E2E machines (MA675E-17909...) all "Main Gate" – test pollution, not mine, not touched.
- S5 Office hour empty state: "এখনো কোনো অফিস আওয়ার সংরক্ষিত হয়নি।" ok.
- S6 Employee leave page: rows list employees with per-row "নতুন ছুটির আবেদন"; quick filters show "অপেক্ষমাণ (0) অনুমোদিত (0) প্রত্যাখ্যাত (0)", duplicate names ("Seed Class Teacher" x2, "Seed Subject Teacher" x2) with no disambiguator.
- S7 Grace page category checklist has overlapping categories (নিরাপত্তা কর্মী vs নিরাপত্তা প্রহরী; শিক্ষক vs প্রভাষক/অধ্যাপক).

## UC1/2/3/4/5a (student) findings (owner on phone 390x844 unless noted). IDs F# ; jev verdicts filled in at end
- F1 [bug, major] Unmarked past days count as ABSENT even before the student existed. Book /school/attendance/book?classSection=<UXA>&month=2026-10: all 13 students "A" on Oct 1 (students created Oct 3); student log Fatema: "বৃহস্পতি ০১ অক্টো অনুপস্থিত". Root cause: book/page.tsx ~L215 registerDayStatus({hasRecord}) – no enrolment-date check. Fix: skip dates < student.created_at/admission_date (blank).
- F2 [inconsistency, major] Dashboard "আজকের উপস্থিতি ৩.৫% / ১০ আজ উপস্থিত" (app/school/page.tsx L139-140 attendanceRate(presentToday,totalStudents)) divides marked-present by ALL students (287) so partial marking = alarm "alert" tone; mark landing shows "275/278 উপস্থিত" (unmarked default present) and class stats "৭৬.৯%". Three different numbers for "today present". Fix: rate over students in classes with attendance taken, show "X/Y ক্লাসে নেওয়া হয়েছে".
- F3 [inconsistency, minor] Mark page header "২৮২ জন শিক্ষার্থী মোট" (school) next to stat card "মোট শিক্ষার্থী ১৩" (class) – two "total" numbers, unlabeled scope.
- F4 [hurdle, major] Phone 8AM task: dashboard→mark first load 20s (dev), class picker at y=947, first roster card at y=1241 on an 844px viewport (needs scroll before any marking); needs class combobox tap + option + "ফিল্টার" tap = 3 taps before roster; whole flow 10 taps/38.8s incl. load. Header stat cards + 4 quick-action cards + pills push roster below fold. Fix: for a class teacher with a single class auto-select; auto-apply on pick (drop ফিল্টার button); collapse stat cards on mobile.
- F5 [hurdle, minor] Tap targets on phone: breadcrumb "ড্যাশবোর্ড" 54x20, sub-nav pills 28px tall (শিক্ষার্থী হাজিরা 98x28, হাজিরা খাতা 84x28, শিক্ষার্থী লগ 80x28, ছুটি ব্যবস্থাপনা 92x28), clear-combobox button 32x42.
- F6 [inconsistency, minor] Bangla UI shows Latin digits/letters in Book (headers 1..31, cells P/A, legend "P = উপস্থিত"), student-log roll "3", mark saved bar "সংরক্ষিত 12:25 PM"; Elsewhere Bangla digits (২৮২, ১৩).
- F7 [bug/hurdle, major] Marking on weekly off day (today Sat 2026-10-03 is ছুটির দিন in off-day calendar; dashboard code has offToday) accepted with no warning; student log then shows Oct 3 "উপস্থিত" while Oct 2 "ছুটির দিন". No banner on mark page.
- F8 [hurdle, major] Unsaved changes lost silently: with an unsaved flip (hint "সংরক্ষণ করা হয়নি" appears), clicking sub-nav link শিক্ষার্থী লগ navigates with no beforeunload/confirm dialog (dialog=false). Save button is never disabled even with no changes.
- OK: save feedback 1.8s ("সংরক্ষিত 12:25 PM · সংরক্ষণ করেছেন আপনি"); fixing mistake after save: 3 taps/0.97s, persisted (aria-pressed verified, cause text "জ্বর" persisted); double-click save -> 1 POST (single submit).
- F9 [inconsistency, minor] Book shows holiday as blank cell, student log shows "ছুটির দিন"; book header marks off days red only.

## UC5b/6/7 employee attendance (owner, desktop; phone checked)
- F10 [inconsistency, major] Same state, 4 labels on a weekly-off day (today Sat 2026-10-03): Employee calendar cell "ছুটির দিন"; Table view (?view=table) every employee "অবস্থা: অনুপস্থিত"; Employees list "এখনো আসেননি ১০ / আজ উপস্থিত ০/১০ 0%" + banner "আজ প্রবেশ করেননি: ..."; per-employee page "ছুটির দিন". Table and list should show ছুটির দিন and not count a holiday toward absence. (app/school/employees/page.tsx, attendance/employee table)
- F11 [inconsistency, minor] Absent semantic: calendar past days "০% (০/১০)" and popover "অনুপস্থিত" for every employee on every working day (no data = absent); no "no record / machine not synced" state. Table "প্রবেশ — / প্রস্থান —  অনুপস্থিত".
- F12 [inconsistency, minor] Digits: per-employee page stats "0%", "1", "0" (Latin) vs Bangla digits in calendar/legend in the same page.
- F13 [hurdle, minor] Employees list "হাজিরা দেখুন" appears 3 ways: header button and KPI link -> /school/attendance/employee (all-staff calendar), row buttons -> per-employee page. Same label, different targets. Row buttons also duplicated in DOM for mobile cards (first match hidden).
- F14 [hurdle, minor] Per-employee "popup": soft-nav from list lands on a full-page-looking view (breadcrumb ড্যাশবোর্ড › ব্যক্তিবর্গ › কর্মচারী › হাজিরা দেখুন); no role=dialog, Esc does nothing; (c7-popup.png). Intercepted route app/school/@modal/(.)employees/[id]/attendance/page.tsx does not behave as modal.
- F15 [hurdle, minor] Calendar page: breadcrumb "কর্মচারী উপস্থিতি" + H1 + active pill = 3 repeats of same label; sub-nav pills 28px tall and breadcrumb links 20px high on phone (small tap targets); month arrows 36x36, আজ 38x30 (<40).
- OK: month nav via links ?month=2026-09 (4.2s dev), Today link, day popover lists each employee with status (phone popover 314x274 fits), table view has name q + date filter, invalid ?month=2026-10-bad falls back to current month silently, no console errors.
- Calendar-vs-list counts: calendar Oct 1 "০/১০" , employees list "০ / ১০", dashboard "মোট কর্মচারী ১০" -> consistent counts (10).

## UC10 student leave (owner desktop). Created UXA test leaves: Rahim 10-06..08 (pending), Karim 10-29..11-02 (APPROVED), Fatema 10-04 no reason (REJECTED), Sadia 10-01..03 backdated (APPROVED)
- F16 [hurdle, major] Approve/reject are one-click with NO confirm, NO undo, NO rejection reason (leave table buttons অনুমোদন/প্রত্যাখ্যান; l4). Rejected row shows প্রত্যাখ্যাত with only "বিস্তারিত". Fix: reject opens small reason sheet; toast with "পূর্বাবস্থায়" for 5s.
- F17 [bug, minor] Form validation: reversed dates (from 10-08 > to 10-06) -> dialog stays open but no readable error text captured in DOM (only dialog remains); empty reason accepted (stored as "—"); no max range. (l2-reversed.png)
- F18 [inconsistency, minor] Leave table shows ISO dates "2026-10-04" in Bangla UI while log shows "শনি ০৩ অক্টো"; roll column Latin.
- F19 [hurdle, major] Page has two independent filter sets (roster: rosterClass/rosterQ, and leave list: classSection/q). Searching "UXA-Att Rahim" filters only the roster; the leave table below still shows Fatema/Karim. Also ?classSection=<uuid> from other attendance pages is ignored (list shows all 280+ students). Search requires pressing ফিল্টার (Enter also works).
- F20 [bug, major] Approved leave not reflected on the teacher's mark page or Book: Mark page date=2026-10-01 for Sadia (approved leave 10-01..03) shows default "উপস্থিত" pressed, no "ছুটিতে" badge, and a teacher can save her Present/Absent. Book shows BLANK for that cell (legend only "P = উপস্থিত, A = অনুপস্থিত", no leave symbol) while Student log shows "ছুটিতে". Same for future approved leave (Karim 10-29: mark page no marker). Book also shows holidays blank (indistinguishable from unmarked).
- F21 [inconsistency, minor] Mark page stat labels say "আজ উপস্থিত / আজ অনুপস্থিত" even when viewing past date (?date=2026-10-01), while showing "আজকের হাজিরা এখনো নেওয়া হয়নি" yet roster counter reads "14/14 উপস্থিত" (unrecorded day defaults everyone Present). Mark page for a never-taken day pre-selects Present -> blind-save risk.
- OK: cross-month leave (10-29..11-02) created and approved; Nov book shows no leaked data. Approve -> status অনুমোদিত in ~3.7s.
- Mark page pending panel "অপেক্ষমাণ ছুটির আবেদন: শিক্ষার্থী ছুটির আবেদন: ৩ → পর্যালোচনা করুন" links to the leave page (good shortcut).

## UC8/9/11/12/13 + permissions
- F22 [inconsistency, minor] Approved employee leave (Staging Teacher Two 10-04..05) appears on Off-day calendar (cell text "Staging Teacher Two") but Employee attendance calendar shows "আসন্ন" for those days; no leave info there.
- F23 [bug/permission, major] Class teacher (classteacher.json) can open and see add/edit/delete controls on /school/attendance/machine (মেশিন যোগ করুন, সম্পাদনা, মুছুন), plus grace-time, office-hour, employee calendar, employee leave page with "নতুন ছুটির আবেদন" buttons. Staff role is correctly blocked (/school/permission-denied) on all attendance pages. Fix: gate employee/machine/grace/office-hour routes to owner/admin in the route guards.
- F24 [inconsistency, major] Class teacher mark page: class dropdown lists "UXA-Att … - A" but roster says "এখনো কোনো শিক্ষার্থী নেই", yet panel says "সব শ্রেণির আজকের হাজিরা নেওয়া হয়েছে" and "শিক্ষার্থী ছুটির আবেদন: ১" while student leave list shows 0 rows (counts unscoped: mark/page.tsx L81/L86 pending counts). Student-log of a student outside scope = 404 (fine).
- F25 [hurdle/inconsistency, minor] Off-day page "তালিকা" toggle (?view=list) is not a list: it is a 12-month year grid with Latin digits (1..31) vs month view Bangla digits. Clicking the toggle link on first try did not navigate in 4s (dev). No true holiday list with dates in one place.
- F26 [inconsistency, minor] Sidebar Attendance children: উপস্থিতি, ছুটির দিন ক্যালেন্ডার, শিক্ষার্থী(->/mark), কর্মচারী(->/employee/office-hour, shown aria-current while on /employee calendar), মেশিন হাজিরা. Parent উপস্থিতি and শিক্ষার্থী resolve to same page. Leave management reachable only via pills; machine + grace-time pages have no breadcrumb; "ছুটি ব্যবস্থাপনা" pill label identical in student and employee groups.
- F27 [polish] Grace exemption: native validation message is English ("Value must be greater than or equal to 0."); empty category submit shows no inline error. Delete has confirm ("মুছে ফেলবেন?") - good; test exemption created/deleted OK. Holiday add (10-14 "UXA-Att holiday") appears instantly on calendar and in employee calendar; removed (verified absent afterwards).
- F28 [polish] Machine setup list contains many leftover E2E machines with identical serial pattern and "Main Gate"; employee RFID page says 0/11 while elsewhere 10 employees (new employee created concurrently). Machine page: no overflow on phone, button 187x38.
- Not done: standing grace rule creation (form only listed), Windows service download, RFID enrollment writes (view only as requested).

## jev validation (jev_verify, 15 claims in one batch): F1,F2,F4,F5(conf .77 review),F7,F8,F10,F12,F16,F19,F20,F23,F24,F25,F26 = verified (conf .84-1.0). Others (F3,F6,F9,F11,F13-15,F17,F18,F21,F22,F27,F28) are single-source DOM observations from this log - jev: unvalidated (not batch-checked); F14/F17 low confidence.

## BEST VERSION per workflow
W1 Class teacher takes attendance on phone. CURRENT: dashboard -> উপস্থিতি নিন -> scroll to picker (y=947) -> tap combobox -> tap option -> tap ফিল্টার -> scroll to y=1241 -> সকলকে উপস্থিত -> tap each absent (+reason) -> সংরক্ষণ = 10 taps, ~39s incl 20s dev load. PROPOSED (mark/page.tsx + filter form): 1 dashboard card opens /mark?classSection=<teacher's only/first class>&date=today already loaded; 2 compact sticky header (class chip, date, 12/13 counter) with roster at top; 3 pre-selected Present with a single tap on a row toggling Absent; 4 sticky bottom "সংরক্ষণ (২ অনুপস্থিত)" with disabled state when clean; 5 leave/holiday badges per row; 6 unsaved-changes guard. Taps: ~4.
W2 Fix after save. CURRENT 3 taps/~1s, persists. PROPOSED add toast "সংরক্ষিত - পরিবর্তন করুন" + audit "সংশোধিত" tag; same page. 
W3 Book. CURRENT blank for leave/holiday, A for pre-enrolment days, Latin P/A. PROPOSED: hide pre-enrolment, add L/H symbols + legend, Bangla digits/অ/উ letters.
W5 Owner morning check. CURRENT dashboard 3.5% card confusing; absent students need class-by-class; employees on calendar day popover/table. PROPOSED: dashboard card "আজ অনুপস্থিত: শিক্ষার্থী X (Y শ্রেণিতে হাজিরা নেওয়া হয়নি), কর্মচারী Z" with link to a single "আজ কারা অনুপস্থিত" list (new filter on student-log/table view). Holiday banner when off.
W10/11 Leave. CURRENT per-row "নতুন ছুটির আবেদন", approve/reject instant, two filter sets. PROPOSED: one filter bar; approve = toast with undo; reject = reason sheet; approved leave surfaces as ছুটিতে on mark page + book.

| Workflow | steps | clarity | error-proof | feedback | mobile | consistency | (current -> proposed)
| W1 phone take | 2->5 | 3->5 | 2->4 | 4->5 | 2->5 | 3->4
| W2 fix mistake | 4->5 | 3->4 | 3->4 | 4->5 | 3->4 | 3->4
| W3 book | 3->4 | 2->4 | 2->4 | 3->3 | 2->3 | 2->4
| W5 owner morning | 2->5 | 2->4 | 3->4 | 3->4 | 2->4 | 1->4
| W6/7 employee cal | 4->4 | 3->4 | 3->4 | 3->4 | 3->4 | 2->4
| W8 grace | 4->4 | 3->4 | 3->4 | 4->4 | 3->3 | 3->4
| W10 leave req/approve | 3->4 | 3->4 | 1->4 | 3->5 | 3->4 | 2->4
| W11 holiday | 4->4 | 3->4 | 4->4 | 4->4 | 3->4 | 3->4
| W13 navigation | 2->4 | 2->4 | 3->4 | 3->3 | 3->4 | 2->4

## Leftover test data (UI cannot delete): class "UXA-Att 1790996221552" + 12 students "UXA-Att *" (attendance records Oct 3, absences with cause "UXA-Att 1790996221552 জ্বর"); leaves: Rahim 10-06..08 pending, Karim 10-29..11-02 approved, Fatema 10-04 rejected, Sadia 10-01..03 approved, employee Staging Teacher Two 10-04..05 approved ("UXA-Att emp leave"). Removed: grace exemption, holiday 10-14.
