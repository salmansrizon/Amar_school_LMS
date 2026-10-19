# Academics audit REPORT (append-only)
Test exam id: e7b1359d-8fa7-4636-b192-954141c11f97 ts: 10030858

## UC3/4 exam (owner, bn, desktop) – first pass
F1 [bug/minor] /school/exams/<id>/admit-cards with no class shows "নম্বর এন্ট্রির আগে পরীক্ষা সেটআপে একটি শ্রেণি নির্বাচন করুন।" (marks-entry copy reused on admit-card page; seat-plan & routine have their own wording: "সিট প্ল্যান তৈরির আগে…", routine says "বিষয়-শিক্ষক বরাদ্দের আগে…" – routine copy also wrong for exam routine). Evidence: DOM text captured.
F2 [hurdle/major] Empty-state pages (marks-entry, routine, admit-cards, seat-plan) of an exam with no class tell user to "select a class in exam setup" but give no link/button to the setup. Evidence: DOM text only, no interactive element.
F3 [hurdle/minor] /school/exams: 254 exams in list, 225 "বন্ধ", 28 "সেটআপ বাকি"; dashboard banner lists test exams. Page load 6.6s (dev).
F4 [bug?] direct goto of /school/exams/<id> and /result-book, /printables gives net::ERR_ABORTED (probably redirect; checking).
F5 [bug/major] Exam setup page /school/exams/<id> for an exam with NO class, NO subjects, NO marks shows status chip "চলমান" and enables top "ফলাফল প্রকাশ করুন" (135x28) + "পরীক্ষা বন্ধ করুন" buttons. Lifecycle stage is wrong (should be "খসড়া/সেটআপ বাকি" as /school/exams list says "খসড়া / শুরু হয়নি") and publish should be disabled until class+subjects+marks exist. Inconsistent with list (খসড়া) vs detail (চলমান). (publish NOT clicked)
F6 [inconsistency/polish] /school/classes: section heading counter "শ্রেণিসমূহ 1" Latin digit while rest uses Bangla digits (১ শ্রেণিসমূহ).
F7 [hurdle/minor] Exam Basic Info class dropdown lists "সকল শ্রেণি" + "UXA-Att 1790996221552 - A — 2032" (label = name - section — year); classes page shows "UXA-Att …" with "শাখা: A" separately and year column => 3 label formats for one class. Shift column "শিক্ষাস্তর" shows "০ শিক্ষাস্তর", class table shows "—".
Note: school has only 1 class (UXA-Att test class, 12 students, 0 subjects, no class teacher) -> used as the test class.

## UC1 Classes & Curriculum
Flow (current): /school/classes?tab=subjects -> "+ বিষয় যোগ করুন" (dialog: শ্রেণি, নাম, কোড, তত্ত্বীয়, এমসিকিউ, ব্যবহারিক, পত্র সংখ্যা) -> pick class -> fill -> submit = 6 clicks/fields, ~2.5s round trip. Added "UXA-Acad Math 10030858" (70 theory+30 MCQ) and "UXA-Acad Eng 10030858" (100) to the UXA-Att class.
F8 [hurdle/major] After subject-add submit there is NO success feedback: dialog closes, no toast detected (polled [data-sonner-toast],[role=status] at 150/400/800ms: only the standing warning banner), screenshot confirms. User only learns via new table row. Also the top banner "শিক্ষক নির্ধারিত নয়" stays and KPI অসম্পূর্ণ lists; page does a full reload (navigation) after submit.
F9 [inconsistency/polish] Subjects table shows Latin digits (70 / 30 / 100) while KPI cards use Bangla digits (১৩, ২). Same in classes table "শ্রেণিসমূহ 1".
F10 [hurdle/minor] Subject form has no "total/full marks" shown (only theory/MCQ/practical inputs, 133px-wide cramped fields in a row) and no computed total/pass-mark; table has no total column. Suggested subjects button ("প্রস্তাবিত বিষয়সমূহ") exists, 32x38 icon-only with empty accessible label.
F11 [inconsistency/minor] KPI "ভর্তিকৃত শিক্ষার্থী" showed ১২ then ১৩ minutes later (concurrent test data, not a bug) - ignore.
Copy-subjects-to-class: not testable (only one class in school) -> uncovered.

## UC3 Exam – Basic Info (class set to UXA-Att)
Flow current: /school/exams -> open exam (via "মূল তথ্য পূরণ করুন") -> setup page (single long page: মূল তথ্য, গ্রেডিং স্কিম, বিষয়-শিক্ষক বরাদ্দ) -> class combobox -> সংরক্ষণ. Subjects auto-appear in "বিষয়-শিক্ষক বরাদ্দ" with পূর্ণমান (100/100). No toast on save (polled 200/600/1500ms: empty); console warning "Base UI: A component is changing the default selectedValue state of an uncontrolled Combobox".
F12 [bug/major] Draft exam (no class, no grading scheme, nothing) has a prominent top banner "প্রকাশ করলে শিক্ষার্থীরা নিজেদের ফলাফল দেখতে পাবে…" + enabled button "ফলাফল প্রকাশ করুন" ABOVE breadcrumbs, regardless of readiness (no marks, no grading scheme "— কোনোটি নয় —"). Same as F5; still "চলমান" after class set.
F13 [inconsistency/minor] Exam setup: "বছর" shows Latin "2026", date input native "mm/dd/yyyy" (en-US) in a Bangla UI; exam year 2026 vs class year 2032 vs header "২০৩০, ২০৩১, ২০৩২ শিক্ষাবর্ষ" - no warning about year mismatch.
F14 [hurdle/major] No stepper/progress for the exam: setup page does not tell the next step (class -> grading scheme -> subjects/teachers -> routine -> marks -> publish). Destructive "মুছে ফেলুন" and "পরীক্ষা বন্ধ করুন" sit in the same row as "প্রমোশন"; save gives no feedback.
F15 [hurdle/minor] Saving class works but there is no dirty/saved state; "সংরক্ষণ করুন" is full-width 1102x40 for a 4-field form.

## UC3 grading scheme / marks entry
F16 [bug/major] Only grading scheme in school ("ZZ Map366 Test Scheme", GPA, pass 33%) has ZERO grade bands (grading-schemes page: "এখনো কোনো গ্রেড ব্যান্ড নেই"), yet it can be attached to an exam with no warning and no toast; grade column can never compute. Selecting scheme on setup page gives no feedback (code: setup-controls.tsx:231-262 only router.refresh()).
F17 [inconsistency/minor] Grading-scheme dropdown on setup is a combobox that needs click + ArrowDown to list (first 1.5s after click returns no options in automation) -- low confidence, skip.
F18 [bug/major] Marks entry (/exams/<id>/marks-entry) on untouched exam shows "0" in every theory input and মোট=0 for all students (not blank / placeholder), so "not entered" is indistinguishable from "scored 0"; header hint "গ্রেড দেখতে পরীক্ষা সেটআপে একটি গ্রেডিং স্কিম নির্বাচন করুন।" is 12px grey. Subject dropdown truncates name ("UXA-Acad Eng 1003085…"). Roll column uses Latin digits.
Marks-entry experiments on test exam (Eng, full 100; input attrs max=100 min=0 step=""):
F19 [bug/major] Typing "150" is silently clamped to "100" (no message/red state); typing "-5" yields "05" (minus dropped, total shows 5); typing "a" or clearing yields "0" -> cannot clear a cell, and there is NO absent (অনুপস্থিত) option. Evidence: inputValue after each keystroke sequence: 150->100, -5->05, 72.5->72.5, a->0, ''->0; MOTO column mirrors.
F20 [hurdle/major] Save ("সংরক্ষণ করুন") gives no feedback (toast/status polled at 200/600/1500ms empty); persistence verified only by reload (85,33,32,100 persisted). Unentered students (e.g. roll 5) persist/display as 0.
F21 [hurdle/minor] Keyboard: Enter does not move focus (stays on same input); Tab moves down to next student's same-column input (ok); ArrowDown unverified. Entry of 12 students = 12 x (type+Tab) fine but no per-row failed/pass indicator (pass mark 33 vs 32): row for 32 shows no fail marker.
F22 [inconsistency/minor] Grade column "—" for all rows due to F16 but no inline explanation next to the column.

## UC3 results (result-book)
Entered Eng: R1=85,R2=33,R3=32,R4=100 ; others untouched (0). Math not yet entered.
F23 [bug/major] result-book: students whose marks were NEVER entered show "0 / 200, GPA 0.00, গ্রেড F, অনুত্তীর্ণ" – not-entered is treated as failed; no "অসম্পূর্ণ/নম্বর বাকি" state. Evidence DOM: "5 UXA-Att Tanvir Ahmed 0 / 200 0.00 F অনুত্তীর্ণ" (x9 rows). Also rows with real marks (85/200, 100/200) are F because Math=0 and scheme has no bands (see F16) and মেধাক্রম "—" for all.
F24 [inconsistency/minor] result-book totals "85 / 200" & GPA "0.00" Latin digits; marks-entry total "85"; roll "1" Latin vs Bangla digits elsewhere (KPIs ১২).
F25 [hurdle/major] Roster for the exam includes roll 77 "UXA-People 20261003C Roll1" (a student from another test data set) - cannot judge; skip as data.
F26 [bug/minor] /exams/<id>/promotion produced PAGEERROR "Switched to client rendering because the server rendering errored: __webpack_modules__[moduleId] is not a function" (likely dev HMR; unvalidated). Promotion page proposes ALL students "(পুনরাবৃত্তি)" repeat the same class because result F, even with incomplete marks -> dangerous default.
/school/exams/<id>/printables is not a route (blank); documents are in modal "পরীক্ষার কাগজপত্র".

Entered Eng R1=85,R2=33,R3=32,R4=100 and Math(70 th+30 mcq) R1=60+25,R2=20+10,R3=70+30,R4=33+0. Marks-entry row totals correct (85,30,100,33; POST 200 in 635ms; no UI feedback).
Hand recompute vs result-book (pass rule: each subject >=33%): R1 170/200 pass; R2 63 (Math 30<33) fail; R3 132 (Eng 32<33) fail; R4 133 pass.
Result-book shows: 170/200 উত্তীর্ণ; 63/200 F অনুত্তীর্ণ; 132/200 F অনুত্তীর্ণ; 133/200 উত্তীর্ণ -> totals and pass/fail CORRECT.
F27 [bug/major] result-book মেধাক্রম: Rahim (170) and Nusrat (133) BOTH rank "1"; GPA 0.00 and grade "—" for passing students (no grade bands, F16). Ranking basis is "গ্রেড অনুযায়ী" (promotion page) so total marks are ignored as tiebreak. A passing student showing GPA 0.00 is contradictory.
F28 [hurdle/major] Subject switch in marks entry (combobox -> router.replace ?subject=) takes ~9s (dev), silently DISCARDS unsaved edits (typed 11 then switched; no unsaved warning; Eng value stayed 85). Also during dev run page looped full navigations (env).

## UC3 print previews
Mark-sheet (/exams/<id>/mark-sheet/<student>): marks right (Eng 100/85, Math 100/85, 170/200) but GPA "সর্বমোট GPA: 0.00", grade "—" next to "উত্তীর্ণ" => official document internally contradictory (F16/F27). Has template switcher (টেমপ্লেট ১/২/৩) + "EdumeBD দ্বারা পরিচালিত / Powered by" footer; print CSS hides aside/nav/header (verified computed display) ; print-all = 11 A4 pages for 14 students.
F29 [bug/minor] Admit card (print-all?doc=admit-card): fields "পরীক্ষা কেন্দ্র —", father "—", no exam schedule/subject-date table (exam routine empty, nothing warns the user that admit cards will print without a schedule). "ছবি" photo box empty. 14 cards printed (consistent with preview 14 rows).
F30 [inconsistency/minor] Print documents show roll Latin "12", "77" while UI chrome Bangla; class label "UXA-Att 1790996221552 / A" (slash) vs "UXA-Att 1790996221552 - A — 2032" elsewhere (3rd format).
F31 [hurdle/minor] Admit-cards page lists 14 students incl. roll 77/78 from other test data; seat-plan print-all page rendered app shell + "Powered by" and no seat content (seat plan empty: "এখনো কোনো সিট প্ল্যান নেই") with "প্রকাশ করুন" button visible on empty plan.

## UC3/4 publish + lifecycle (own test exam)
F32 [bug/blocker] "ফলাফল প্রকাশ করুন" publishes IMMEDIATELY with no confirmation: clicked once -> POST fired, dialog count 0 -> banner became "✓ ফলাফল প্রকাশিত | প্রকাশ বাতিল করুন". Done on an exam with 4 of 14 students having marks, 12 never entered, and a grading scheme with no bands. Students could see F/0.00 results. No readiness checklist/blocker.
F33 [bug/major] Exam-list progress is inflated: /school/exams row shows "২৬ / ২৮ · ৯৩%" for UXA-Acad exam although only 8 marks cells (4 students x 2 subjects) were really entered; saving the marks grid persisted 0 for all untouched students, which then count as "entered". (Related F18/F20.)
F34 [bug/major] Stage chip inconsistency: after publish, setup page still shows chip "চলমান" while list shows "প্রকাশিত"; before publish a draft showed "চলমান" too. Stage chip is not derived from lifecycle.
F35 [hurdle/major] Publish/unpublish banner sits ABOVE breadcrumbs/title at page top (easy to miss, 135x28 button); delete ("মুছে ফেলুন") and close ("পরীক্ষা বন্ধ করুন") are red neighbours of "প্রমোশন".
List row shows "রুটিন বাকি ¦ সিট প্ল্যান বাকি" pills with CTA "রুটিন তৈরি করুন" -> good next-step cue on list but absent on setup page.
F36 [inconsistency/major] Confirmation patterns: "পরীক্ষা বন্ধ করুন" shows a strong irreversible-confirm dialog ("এই কাজটি ফিরিয়ে আনা যাবে না… হ্যাঁ, স্থায়ীভাবে বন্ধ করুন"), delete shows a dialog, but publish and unpublish ("প্রকাশ বাতিল করুন") fire on a single click with no dialog (POST immediately; dialog count 0). Publish is the action with the biggest audience impact. I unpublished the test exam (state restored; banner back to "ফলাফল প্রকাশ করুন").
F37 [inconsistency/polish] Student portal (/student/results) shows "1 বিষয়" (Latin digit) while home shows roll "১"; brand "এডুমিবিডি" in portal header vs "EdumeBD দ্বারা পরিচালিত" printed footer. Student fixture belongs to Seed Class so could not compare my exam's result between admin and portal (uncovered).

## UC3 exam routine (/exams/<id>/routine)
Flow current: open page -> inline form (তারিখ, শুরু, শেষ, বিষয়, কক্ষ) -> যোগ করুন; 1 entry = ~5 interactions, 3 native date/time inputs.
F38 [bug/major] Overlap accepted: Eng 2026-12-10 10:00-13:00 and Math same day 11:00-12:00 for the SAME class both saved; no conflict warning. Evidence: table rows "2026-12-10 বৃহঃ 10:00 - 13:00 UXA-Acad Eng" and "…11:00 - 12:00 UXA-Acad Math".
F39 [inconsistency/minor] Validation error is raw English in Bangla UI: "End time must be after start time" (red, form-level). Date shown ISO Latin "2026-12-10", time 24h "10:00 - 13:00" while pickers show 12h "01:00 PM", "12/12/2026" (en-US).
F40 [hurdle/minor] Room dropdown is empty ("কক্ষ নির্বাচন করুন" only) with no link to create rooms; delete "✕" is 27x22px, row deletes without confirm shown (not clicked). Routine page has no date-range prefill (exam start date empty) and no subject-per-day suggestion; "প্রিন্ট" present.

## UC6 Messages & Requests hub (/school/questions, /corrections, /questions/response)
Flow current: sidebar "বার্তা ও অনুরোধ" (under "অর্থ ও যোগাযোগ" group, not under Academics) -> tabs শিক্ষার্থীদের প্রশ্ন / সংশোধনের অনুরোধ / উত্তরের অবস্থা.
Data: 9 questions, all answered (0 pending), 0 corrections -> no item to reply to; reply flow uncovered. Empty-state judged: corrections "কোনো অনুরোধ নেই।" (plain, no guidance on how students raise requests).
F41 [inconsistency/minor] Duration badges use Latin digits and no space: "57ঘণ্টায় উত্তর", "281ঘণ্টায় উত্তর", "54.6ঘণ্টা", while KPI uses Bangla digits (০, ৯). Badge is green even when answer took 281h (>72h SLA the KPI uses).
F42 [hurdle/minor] With 0 pending, the list's default view still lists all 9 answered items under a quick-filter chip labelled "উত্তর বাকি" (chip not showing active state/count) -> unclear what the list is filtered by; "মোট: ৯" in header vs "উত্তর বাকি ০" confusing.
F43 [inconsistency/polish] Hub test data in English ("E2E question…", "XS1 Physics") fine; hub lives under Finance & Communication nav group, but Teacher-facing questions are academic; owner looking in "পাঠদান ও অ্যাকাডেমিক" won't find it.
F44 [bug/minor] Unknown/non-existent /school/* routes (e.g. /school/behaviour, /school/messages) redirect to "অনুমতি নেই — এই স্ক্রিনে আপনার অ্যাক্সেস নেই" for the OWNER instead of a 404: misleading. Evidence: /school/messages -> /school/permission-denied?from=%2Fschool%2Fmessages.

## UC5 Behaviour log (/school/students/<id> bottom section "আচরণ লগ")
Flow current: sidebar শিক্ষার্থী -> directory -> open student -> scroll past profile/contact/guardian/login/subjects (~1265 chars) to "আচরণ লগ" at very bottom -> textarea ঘটনার বিবরণ + rating(0-10) + রিমাইন্ড তারিখ -> যোগ করুন. ~6 steps, ~4 screens of scroll. Added entry "UXA-Acad behaviour test 10030858: talked in class" rating 3.
F45 [hurdle/major] Behaviour log is buried at the bottom of the student profile and not reachable from Academics/classes; no class-wide view. No success toast; entry appears in list (OK).
F46 [hurdle/minor] Rating "রেটিং (০–১০)" has no direction label (is 10 good or bad?); rating 15 is blocked only by browser-native validation (no inline message; POST 0). Entry shows "গড় রেটিং: 3" Latin digit and date "03/10/2026" (dd/mm/yyyy Latin) vs routine ISO "2026-12-10" -> 3 date formats.
F47 [hurdle/minor] Each entry shows "এসএমএস পাঠান" next to "সম্পাদনা" (not clicked, safety) - sending a parent SMS from a log row with no preview/confirm discovered; footer "তৈরির ৩ দিন পর এন্ট্রি রিড-অনলি হয়ে যায়" is shown only as tiny hint. No advisory AI triage display found anywhere on the page (uncovered / not present).
F48 [hurdle/minor] Student profile "বিষয় বরাদ্দ: কোনো বিষয় বরাদ্দ নেই" for a student whose class has 2 subjects and has exam marks in both -> unclear what the per-student assignment is for (optional-subject only?) - wording should say "সকল বিষয় ক্লাস থেকে আসে; শুধু ঐচ্ছিক বিষয় এখানে".

## Permission check (classteacher.json = "Seed Class Teacher", teaches Seed Class; exam belongs to UXA-Att class)
F49 [bug/blocker] Class teacher of ANOTHER class can open /school/exams/<id> (setup page) with enabled Save, grading-scheme, "ফলাফল প্রকাশ করুন", "মুছে ফেলুন", "পরীক্ষা বন্ধ করুন" and actually PUBLISHED my test exam (POST 200, banner "✓ ফলাফল প্রকাশিত"). I unpublished it afterwards as owner. (marks-entry & result-book correctly show "এই শ্রেণিতে কোনো শিক্ষার্থী নেই" - data scoped, but write actions are not.) Also /school/classes is reachable with "+ শ্রেণি যোগ করুন".
F50 [bug/major] For the class teacher, /school/exams redirects to /school/exams/<E>/result-book (a different class's exam) and shows "এই শ্রেণিতে কোনো শিক্ষার্থী নেই" - the teacher never sees an exam list.

## Mobile (390x844) pass – no horizontal page scroll anywhere (HS=0)
F51 [hurdle/major] Tap targets <40px on phone: marks-entry inputs 64x28 (x14 rows), "ফলাফল প্রকাশ করুন" 135x28, "পরীক্ষা বন্ধ করুন" 104x28, "মুছে ফেলুন" 79x30, routine delete "✕" 27x22, result-book print icon buttons 27x36, behaviour "এসএমএস পাঠান" 107x26 / "সম্পাদনা" 68x26 / "যোগ করুন" 78x26, tabs ("শ্রেণিসমূহ"/"বিষয়সমূহ") 113x38. The destructive "✕" and publish are the smallest.

## UC2 class routine (/school/classes/routine?class=<id>) + UC7 owner overview
Class routine: grid 8 periods x 5 days (রবি–বৃহঃ), each cell "＋" (56px) -> inline editor with 3 selects (বিষয়, শিক্ষক, কক্ষ) + "সংরক্ষণ" + "✕"; header "প্রিন্ট করুন | বাতিল | খসড়া | প্রকাশ করুন" (publish 28px high). Current effort per cell: ＋, 3 selects (2 clicks each) , save ≈ 8 clicks; 40 cells = 320 clicks, no copy-row/copy-day, no period times shown (only 1..8), hint "দ্বন্দ্ব হলে লাল বার্তা" (conflict check exists; not exercised - class has no teacher/rooms).
F52 [hurdle/major] Class routine: no period start/end times in the grid, no "copy to other days", no teacher/room pre-fill from subject, publish without confirm. Rooms list empty globally (same as exam routine F40).
UC7: /school/exams KPI "নম্বর প্রদান অগ্রগতি —" (dash) and quick filter "নম্বর বাকি (০)", "প্রস্তুত (০)" while the exam I touched had 4/14 students with marks -> owner cannot see who is behind because progress counts saved zeros (F33). 225 of 254 exams are "বন্ধ" and 28 "সেটআপ বাকি" test leftovers bury the real exam in default "সবগুলো" view; default view not filtered by selected শিক্ষাবর্ষ (2030-32 header vs exam years 2026).
F53 [hurdle/minor] Exams list default tab "সবগুলো (২৫৪)" ignores the header শিক্ষাবর্ষ selector (2030–2032) and shows 2026 exams; no "my pending actions" grouping.

## jev validation (2 batches, 17 claims)
verified (conf>=0.86): F32 publish no confirm; F49 classteacher publish; F19 clamp/zero; F33 inflated progress; F27 rank tie/GPA 0; F38 overlap; F39 English error; F23 zero=fail; F36 confirm inconsistency; F5/F34 chip; F1 copy; F8 no toast; F44 permission-denied for unknown route; F51 tap targets; F9 digits.
verified but LOW confidence (review): F16 no grade bands (0.51; direct DOM read of grading-schemes page, treat as verified by tester), F46 behaviour rating validation (0.26 -> downgrade to unvalidated/polish).
unvalidated (no jev claim): F10, F13-15, F17, F21, F26 (dev webpack error), F28, F29-31, F37, F40-43, F45, F47, F48, F50, F52, F53.

## Workflow scores (1-5; steps/clarity/error-proofing/feedback/mobile/consistency)
| Workflow | Current | Proposed |
|---|---|---|
| 1 Classes & subjects | 3/4/3/1/3/3 | 4/5/4/4/4/5 |
| 2 Class routine | 2/3/3/2/2/3 | 4/4/4/4/3/4 |
| 3 Exam e2e (setup->marks->result->publish) | 2/2/1/1/2/2 | 4/5/4/4/4/4 |
| 4 Lifecycle board | 2/2/1/2/3/2 | 5/5/4/4/4/4 |
| 5 Behaviour log | 2/3/3/3/2/3 | 4/4/4/4/3/4 |
| 6 Messages & Requests | 4/4/4/3/4/3 | 4/5/4/4/4/4 |
| 7 Owner exams behind/results | 2/2/2/2/3/2 | 4/5/4/4/4/4 |

## Best version proposals
WF3 exam e2e. CURRENT: /school/exams -> exam -> setup page (class combobox, save, grading select, teachers) [no stepper, no feedback] -> separate pages marks-entry (subject switch = page nav, ~9s dev, loses edits), routine (5 interactions/entry), admit-cards, seat-plan, result-book -> publish at page top, no confirm. ~35 clicks for 2 subjects x 4 students, 7 screens.
PROPOSED (app/school/exams/[id]/page.tsx + setup-controls.tsx): 1 one "Exam stepper" header (1 তথ্য 2 বিষয় 3 রুটিন 4 নম্বর 5 ফলাফল 6 প্রকাশ) with done/blocked states and a single primary "পরবর্তী ধাপ" button; 2 toast on every save (use existing toast util); 3 marks-entry: blank by default (null vs 0), absent toggle "অনুপস্থিত", red state on >max instead of silent clamp, Enter=next row, unsaved-changes guard on subject switch, all subjects as tabs/columns; 4 publish only when checklist (class, scheme with bands, all marks entered or marked absent, routine) is green, with confirm dialog showing counts; 5 server-side class-scope check for teachers on every exam action (publish/delete/close/save).
WF4 lifecycle: derive chip from one function (draft -> setup -> marks pending n/N -> ready -> published -> closed) shared by list and setup page; list "নম্বর বাকি" filter driven by null marks.
WF2 routine: show period times, "copy day/row", conflict warning in exam routine (same class overlapping), Bangla error strings, room creation link.
WF1: toast + keep dialog open "add another"; show পূর্ণমান total column; digits via Bangla formatter.
WF5: put "আচরণ লগ" tab on student page header, add class-level log view, rating direction label, confirm before SMS.
WF6/7: format hours with Bangla digits+space; chip counts; owner exam list default-filter to current year + "নম্বর বাকি" first.

## Uncovered
Copy subjects to class (only 1 class), exam seat plan generation, combinations / multi-exam merge, co-curricular, promotion execution, answering a question/correction (none pending), student-portal comparison for my exam (student fixture in other class), advisory AI triage (no such UI found), grade-band computation (no bands; creating my own scheme not done), marks entry mobile typing flow beyond sizes.

## Leftover test data
Deleted: exam "UXA-Acad 10030858 Exam" (with routine/marks) via UI. Remaining: subjects "UXA-Acad Math 10030858" and "UXA-Acad Eng 10030858" in class UXA-Att (no delete found in UI), behaviour log entry "UXA-Acad behaviour test 10030858: talked in class" (rating 3) on student UXA-Att Rahim Uddin, 14 pre-existing E2E/UXA exams untouched. Exam publish toggled on/off twice (final state unpublished before delete).
