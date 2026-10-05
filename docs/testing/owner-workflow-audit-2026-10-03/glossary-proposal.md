# Bangla / English wording glossary — proposal for approval

Status: PROPOSAL. Nothing in the app has been changed. Once you approve (or amend) the choices, every change in section 7 can be applied one-for-one.

Scope: the school owner, staff and student screens. The platform-admin (super-admin) screens are mostly English-only already and are mentioned only where the same word is shared.

How the counts were made: all 2,486 text entries in the app's dictionary file (`web/lib/i18n.ts`) were read by a script. A "count" below is the number of dictionary entries (keys) whose Bangla (or English) text contains that word as a whole word, including normal endings such as -র, -ের, -দের. A key that contains two competing words is counted under both. Code line numbers are for the `staging-sync` working copy.

Two rules from the project's domain glossary (CONTEXT.md) are binding and shape many choices below:
- **Archived**, not Old / Inactive / Deleted, for students, employees and classes.
- **Off-Day** (a day the whole school is closed) is a different thing from **Leave** (one person's approved absence). A day off is not "holiday" or "weekend" in English.
- **Staff User** (a login with permissions) is a different thing from **Employee** (a person in the staff directory).

---

## 1. Term table

"Count" is the number of dictionary entries using that word. Where two words are really two ideas, the proposal keeps both and says where each goes.

| # | Concept | Variants in use (entries) | Proposed Bangla | Proposed English | Reason |
|---|---|---|---|---|---|
| 1 | Attendance | উপস্থিতি 23 · হাজিরা 27 · English "Attendance" 28, "Mark attendance" 2 vs "Take attendance" 1 | **Two ideas.** হাজিরা = the act and the paper register: হাজিরা নিন, হাজিরা খাতা, হাজিরা শিট, হাজিরা মেশিন, হাজিরা সংরক্ষণ. উপস্থিতি = the result or the state: the section name, rate (উপস্থিতির হার), "আজকের উপস্থিতি", the log, "উপস্থিতি দেখুন". | Take attendance (act) · Attendance (section, rate, log) · never "Mark attendance" | Today the same button is "উপস্থিতি নিন" on the dashboard and "হাজিরা নিন" on the page. Schools say "হাজিরা নিন" when they call the roll and "উপস্থিতির হার" for the percentage. |
| 2 | Employee / staff | কর্মচারী 42 · স্টাফ 21 · কর্মী 3 · English Employee 27, Staff 12 | **Two ideas.** কর্মচারী = a person in the directory (employee). স্টাফ লগইন / স্টাফ = a login that can open some screens (CONTEXT: Staff User). কর্মী stays only inside category names (নিরাপত্তা কর্মী, চিকিৎসা কর্মী, পরিবহন কর্মী) — the owner types those. | Employee · Staff login | CONTEXT keeps these apart. The drift is in 4 places where the directory is called "স্টাফ" (dash.staffDirectory, dash.teachersStaff, sms.modeGroup) and one place where a login is called just "স্টাফ" (staff.createBtn). |
| 3 | Money owed vs still-to-do | বকেয়া 19 (money) · বাকি 23 (mostly "remaining / pending", not money) · English Due 11, Pending 8 | **Two ideas.** বকেয়া = money owed, only for fees. বাকি = anything left to do or remaining (দিন বাকি, উত্তর বাকি, নম্বর বাকি, ক্রেডিট বাকি). | Due (money only) · Pending (tasks) · "left" for balances | One slip: "নম্বর এন্ট্রি বকেয়া" (marks entry overdue) uses the money word for a task; one English label "Due" for the checklist uses it for a task. |
| 4 | Seat plan | সিট প্ল্যান 18 · আসন বিন্যাস 6 · single seat: সিট 1, আসন 3 | **সিট প্ল্যান**; one seat = সিট | Seat plan | Most used (18 vs 6), matches the English, and it is what exam halls actually say. Same screen currently shows both: title "সিট প্ল্যান" and button "আসন বিন্যাস প্রিন্ট". (See question Q1.) |
| 5 | Class | শ্রেণি 122 · ক্লাস 12 · "ক্লাস অফারিং" 7 | **Two ideas.** শ্রেণি = the grade group of students (Class 5-A). ক্লাস = a lesson / a period (ক্লাস রুটিন, আজ কোনো ক্লাস নেই). Retire "ক্লাস অফারিং" (jargon from the domain glossary that no owner says): use "শ্রেণি ও শাখা". | Class · Class and section (never "class offering" in the UI) | 122 of 134 uses are already শ্রেণি. "অফারিং" means nothing to a school owner. |
| 6 | Collecting a fee | ফি আদায় 3 · আদায় করুন/আদায় হয়েছে 11 · ফি কালেকশন 2 | **ফি আদায়** | Collect fee | Matches the other 11 "আদায়" entries (collected, not collected, collect). |
| 7 | The school itself / its owner | স্কুল 54 · প্রতিষ্ঠান 29 · বিদ্যালয় 2 · owner: স্কুল মালিক 5 + স্কুলের মালিক 2 · প্রতিষ্ঠান মালিক 3 · প্রধান শিক্ষক used where English says School Owner 2 | **স্কুল** everywhere, **স্কুল মালিক** for the role. প্রতিষ্ঠান only on the Institute Setup page and for a previous school/college. | School · School Owner | English already says "School Owner" in all 7 places; Bangla uses three different names for the same person. (See Q2 for প্রধান শিক্ষক.) |
| 8 | Archived (not active any more) | পুরাতন 18 · আর্কাইভ 7 · নিষ্ক্রিয় 5 (2 school-side, both unused-looking) · English Old 15, Archive/Archived 9, Inactive 2 | **আর্কাইভ করা** (list names), **আর্কাইভ করুন** (button) | Archived students / Archive | The button already says Archive, the list says "Old", and CONTEXT forbids Old/Inactive. (See Q3.) |
| 9 | Leave vs day off | ছুটি 49 (leave) · ছুটির দিন 10 (off-day, and also "Leave Days" 1) · English Holiday 4, Off day 9, Weekend 1 | **Two ideas.** ছুটি / ছুটির আবেদন = one person's leave. ছুটির দিন = a school-wide day off. সাপ্তাহিক ছুটির দিন = weekly off-day. | Leave · Off-day · Weekly off-day | CONTEXT. "Holiday" and "Weekend" are not used; "Leave Days" card is relabelled so it does not read like an off-day. |
| 10 | Exam timetable | রুটিন (exam routine title) · সূচি 7 · সময়সূচি 5 (3 about exams, 2 about office hours) | **পরীক্ষার রুটিন** | Exam routine | The module and print are called "পরীক্ষার রুটিন"; the same thing is called "সূচি" and "সময়সূচি" on four other screens. Office hours keep their own name "অফিস আওয়ার". |
| 11 | SMS | এসএমএস 20 · "SMS" typed in Latin letters 15 (11 of them on platform-admin screens) | **এসএমএস** | SMS | Majority and the way it is read aloud. |
| 12 | Choose / pick | নির্বাচন করুন 39 · বেছে নিন 4 · বাছাই করো 1 | **নির্বাচন করুন** | Select | Majority. |
| 13 | Search | খুঁজুন 28 · অনুসন্ধান 3 | **খুঁজুন** (button, placeholder). অনুসন্ধান only inside a page title like "ফলাফল অনুসন্ধান". | Search | Everyday word for a search box. |
| 14 | Print | প্রিন্ট করুন 5 · "X প্রিন্ট" (noun style) 9 · ছাপুন/ছাপা 6 | **প্রিন্ট করুন** | Print | One verb. Section 3. |
| 15 | GPA | জিপিএ 1 · GPA typed in Latin 3 | **জিপিএ** | GPA | Matches the student screen. |
| 16 | Settings | সেটিংস 2 · সেটিং 1 | **সেটিংস**, and call the screen by its real name "প্রতিষ্ঠান সেটআপ" | Settings / Institute setup | One spelling; teacher.reachNever says "প্রতিষ্ঠান সেটিংস" but the page is "প্রতিষ্ঠান সেটআপ". |
| 17 | Sign-in | লগইন 24 · সাইন ইন 1 · English Log in 4, Login 2, Sign in 2 | **লগইন** | Log in (verb), Login (noun, e.g. "Staff login") | Majority. |
| 18 | Phone | মোবাইল 13 · ফোন 2 | **মোবাইল** (মোবাইল নম্বর) | Mobile | Majority; sms.phone and feedback.senderContact change. |
| 19 | Description / label field | "বিবরণ" is the Bangla for both Description (4) and Label (1: attendance.offDayLabelField) | Label = **শিরোনাম**; Description = বিবরণ | Label · Description | The off-day label box is called "বিবরণ" but English says "Label". |
| 20 | Details / profile / open | বিবরণ 5 · বিস্তারিত 2 · খুলুন 2 · প্রোফাইল (several) | See section 3. | View / Details / Open | — |

Not competing (checked, no change): ছাত্র/স্টুডেন্ট (0 uses, শিক্ষার্থী 103 only), অভিভাবক (Guardian) 17 with no rival, ফি 74 with no rival (বেতন only in search keywords), পরীক্ষা, ফলাফল, উপস্থিত/অনুপস্থিত, শাখা/Section, নোটিশ 12 vs বিজ্ঞপ্তি 1 (the latter is only "Notifications" = the bell, so they are two ideas and stay), বার্তা, মেসেজ (0).

**Concepts with competing terms: 20** (rows above; 8 of them are really two ideas that stay separate and only need their boundary fixed: 1, 2, 3, 5, 9 and, in part, 7, 19, 20).

---

## 2. Verb form: করুন or করো

| Form | Where it appears | Count | Examples |
|---|---|---|---|
| Formal / polite (আপনি, করুন, দিন, দেখুন) | Owner, staff, teacher screens, sign-in, errors, shared pages | the overwhelming majority: "করুন" alone is in 237 entries, "আপনি/আপনার" in 19 | সংরক্ষণ করুন, ফাইল নির্বাচন করুন |
| Informal (তুমি, করো, দাও, নাও) | Student portal | 23 student.* entries | student.askAbout "প্রশ্ন করো", student.requestLeave "ছুটির আবেদন করো", student.submitWork "কাজ জমা দাও", student.noQuestions "তুমি এখনো…" |
| Informal in the **wrong place** (adults or all roles told "তুমি") | Teacher screens, owner screens, the "page not found" and skip-link used by everybody | 12 entries | questions.reply "উত্তর দাও", corrections.apply "প্রয়োগ করো", response.apply "দেখাও", hub.noClasses / questions.notYours / response.introTeacher "তোমার…", myClasses.none / myClasses.notLinked (teacher told "তুমি … যোগাযোগ করো"), shell.skipToContent "যাও", notFound.body / notFound.home "এসেছ / ফিরে যাও" |
| Formal in the student portal | student.noSubjectsYet "আপনার… প্রশ্ন করুন" (the only one) | 1 | — |

**Proposed rule**
1. The student portal (everything under `/student`, plus blocked.studentInactiveMessage, which is shown to a student) speaks to the child as **তুমি / করো**. This is a legitimate choice for school children and is already 95% how it is written.
2. Everything else, including teachers, staff, the owner and any screen shared by all roles (shell.*, notFound.*, states.*, denied.*, blocked.message), uses **আপনি / করুন**.
3. Never mix the two on one screen. Fix the 12 wrong-place entries and the 1 student entry (section 7, group H).

See Q4 if you would rather the student portal also be formal.

---

## 3. Action labels (one standard each)

"Now" shows what is in use; counts are entries whose label starts with, or is exactly, the word.

| Action | Now (Bangla) | Now (English) | Proposed Bangla | Proposed English | Rule |
|---|---|---|---|---|---|
| Create a new record (top-of-page button) | "নতুন …" 54; "…তৈরি করুন" 14; "নতুন তৈরি করুন" 2 (notices) | New 30 · Add 27 · Create 11 · "+ New/Add" 10 | **নতুন শ্রেণি, নতুন ভর্তি, নতুন নোটিশ** | **New class, New admission, New notice** | "নতুন + noun" for the main button on a page. |
| Add a row to something that exists | "…যোগ করুন" 31 | Add 27 | **বিষয় যোগ করুন, ছুটির দিন যোগ করুন** | **Add subject, Add off-day** | "যোগ করুন" only inside a list or form. |
| Generate something automatically | "…তৈরি করুন" | Create / Generate | **সিট প্ল্যান তৈরি করুন, লগইন তৈরি করুন** | **Generate seat plan, Create login** | "তৈরি করুন" only when the system builds it. |
| Save | "সংরক্ষণ করুন" 12 exactly · bare "সংরক্ষণ" 5 · "…সংরক্ষণ করুন" 16 total | Save 26 · "Save Employee/Admission/Attendance/Draft" 4 | **সংরক্ষণ করুন** | **Save** (or "Save admission", sentence case, only on the main button of a long form) | Never the bare noun "সংরক্ষণ" on a button. |
| Submit to someone | জমা দিন 1 · জমা দাও 1 | Submit 2 | **জমা দিন** (staff), জমা দাও (student) | **Submit** | Used only when another person receives it (leave request, homework). |
| Send / publish | পাঠান 9 · প্রকাশ করুন 4 | Send 12 · Publish 5 | **পাঠান** (SMS, email) · **প্রকাশ করুন** (results, notices, seat plan) | Send · Publish | Unchanged. |
| Filter / apply | প্রয়োগ করুন 4 · ফিল্টার 2 · ফিল্টার করুন 1 · দেখাও 1 · অনুসন্ধান করুন 1 | Apply 5 · Filter 3 · Show 3 | **ফিল্টার করুন** (and **কোড প্রয়োগ করুন** for redeeming a code) | **Filter** (and **Redeem code**) | "Apply" is kept for exactly one thing: applying a correction request. |
| Clear filters | ফিল্টার রিসেট · ফিল্টার মুছুন · সার্চ মুছুন · বাতিল (for Clear) | Clear 3 · Reset 4 | **ফিল্টার পরিষ্কার করুন**, **খোঁজা পরিষ্কার করুন** | **Clear filters**, **Clear search** | "Reset" and "মুছুন" are not used for filters ("Reset password" is a different thing and stays). |
| View a record | দেখুন 8 exactly (29 ending in) · বিবরণ 5 · বিস্তারিত 2 · খুলুন 2 · দেখাও 1 | View 24 · Open 11 · Review 7 · Details 3 | **দেখুন** | **View** | "দেখুন" for a row or link. "বিস্তারিত" is only a section heading (Details). "খুলুন / Open" only for opening a tool or file (exam documents, routine builder, a link). "Review" only on the approvals queue where a decision is needed. |
| Edit | সম্পাদনা 8 · পরিবর্তন | Edit 9 | **সম্পাদনা করুন** | **Edit** | Unchanged. |
| Delete / remove / archive | মুছুন 15 · মুছে ফেলুন 3 · সরান 6 · আর্কাইভ করুন 3 | Delete 22 · Remove 10 · Archive 3 | **মুছুন** = delete for good (confirm: "হ্যাঁ, মুছুন") · **সরান** = take out of a list, data stays · **আর্কাইভ করুন** = move to archive | **Delete · Remove · Archive** | Three different outcomes, three words. "মুছে ফেলুন" is dropped. |
| Print | প্রিন্ট করুন 5 · "X প্রিন্ট" 9 · ছাপুন 4 | Print 17 | **প্রিন্ট করুন**; with an object: **"আইডি কার্ড প্রিন্ট করুন"** | **Print**; with an object: **Print ID card** | One verb form; drop ছাপুন. |
| Back | ফিরে যান 2 · ফিরে যাও 2 · পেছনে 1 · ফিরুন 3 | Back 6 | **ফিরে যান** (with a place: "নোটিশে ফিরে যান") | **Back** (with a place: "Back to notices") | One form. |
| Cancel vs close | বাতিল 10 exactly · বন্ধ করুন 7 | Cancel 8 · Close 5 | **বাতিল** = abandon a form · **বন্ধ করুন** = dismiss a message · exam "বন্ধ করুন" stays (it is a real status, "Closed") | Cancel · Close | Unchanged, but written down. |

---

## 4. Sentence style

| Item | Now | Proposed |
|---|---|---|
| Bangla full stop | "।" ends 195 entries. ASCII "." ends 5 (shell.search, student.search, feedback.replyPlaceholder, feedback.sending, institute.rollIncrementHint). Only 1 entry has "।" in Bangla but no full stop in English (institute.rollIncrementHint); 3 have a full stop in English only (markSheet.roll, admitCard.roll, institute.eiinNo). | A full sentence ends with **"।"** in Bangla and "." in English. A label, button, heading or placeholder has **no** full stop in either language. Question marks stay as "?" (26 each). |
| Ellipsis | "…" (one character) in 16 Bangla and 17 English entries; three dots "..." in 5 Bangla and 4 English entries (shell.search, student.search, feedback.replyPlaceholder, feedback.sending, plus institute.rollIncrementHint's "১, ৩, ৫..." list) | Use the single character **"…"** for "loading" and placeholders ("খুঁজুন…", "Search…"). Keep "..." only inside a number list. |
| Dash | " — " in 88 Bangla and 76 English entries | Keep " — " (spaced) as the separator; no change. |
| English capitalisation | **484** short labels use Title Case on later words ("Student Leave Management", "Mark All Present", "Fee Collection"), **98** longer messages capitalise role/domain words mid-sentence ("the School Owner makes you a Class Teacher"). A "sentence case" label is already the majority style for newer screens. | **Sentence case everywhere**: capital on the first word only. Keep capitals for proper names and acronyms only: EdumeBD, Bangla, English, SMS, GPA, RFID, NID, EIIN, PDF, QR, ID, JPG, PNG, WebP. Role names (school owner, class teacher) are lower-case inside sentences. The 484 label keys are listed in Appendix A. |
| "+" in labels | 13 English and the same 13 Bangla labels start with "+" | Remove the typed "+"; the button shows a plus icon. (Keys listed in Appendix B.) |
| Old/English words inside Bangla text | "Old Students" inside promotion.graduatingHint; "(Letter)", "(Numeric)", "(GPA)" brackets in grading.type*; "(English)" in sa.offday.labelEn | Remove; see section 6. |
| Placeholder text shown to users | "ঠিক N দিন", "ঠিক N দিনের নিয়ম" (sms.exactRule, sms.addExact) show the letter N | "ঠিক … দিন" with a number field, or "নির্দিষ্ট দিনের নিয়ম" (section 6). |

---

## 5. Numbers, dates, money

**Where numbers come from.** Almost all dictionary strings already use Bangla digits (26 entries do; only 2 Latin-digit entries, both technical: claim.slugInvalid, claim.subdomainHint). The Latin digits users see are produced in code, not in the dictionary. The helpers needed already exist: `localeOf(lang)` and `numberFmt(lang)` at `web/lib/i18n.ts:3416` and `:3421`. They are just not used everywhere.

| Item | Bangla mode (proposed) | English mode (proposed) | Where it breaks today |
|---|---|---|---|
| Digits | Bangla digits (০-৯) for every count, roll, percentage, year, date, time and amount | Latin digits | Roll and counts print in Latin digits in several tables (audit observation; roll is not formatted at the call sites). |
| Identifiers | **Stay Latin** in both: student number (S0001), receipt/voucher number, machine ID, NID, EIIN, mobile number. | same | Needs the search box to accept Bangla digits as well (audit finding: a Bangla-digit mobile search returns nothing). See Q5. |
| Money | **৳১৩,৯৫,০০০** — ৳ in front, no space, Bangla digits, lakh grouping (ইন্ডিয়ান/বাংলাদেশি style 3,2,2), no decimals; show ".৫০" only when there are paisa | **৳13,95,000** — same shape with Latin digits, lakh grouping, no decimals unless paisa | See "money sites" below. |
| Amount in words | বাংলায়: "তিনশত টাকা মাত্র" | English: "Three Hundred Taka Only" | `lib/amount-words.ts` is English only; used at `app/school/fees/receipt/[id]/page.tsx:100`. |
| Date, tables and lists | **৩ অক্টো ২০২৬** | **3 Oct 2026** | 47+ date calls with 11 different option sets; 18 hard-coded `'en-GB'` (all but 2 on super-admin/distributor screens); the 2 school ones: `app/school/fees/receipt/[id]/page.tsx:138`, `app/school/students/[id]/behaviour-controls.tsx:104`. |
| Date, short (dense forms, print) | **০৩/১০/২০২৬** (day/month/year, padded) | **03/10/2026** | Mixed padded / unpadded today. |
| Date, headings | **৩ অক্টোবর ২০২৬** | **3 October 2026** | — |
| Month + year | **অক্টোবর ২০২৬** | **October 2026** | fee-form shows "{month}/{year}" with raw numbers (`app/school/fees/fee-form.tsx:126, :271`). |
| ISO dates ("2026-07-16") | Only inside date input boxes, never as text | same | audit saw them on sms/rules, institute checklist, leave table. |
| Time | **৮:৫৮ AM** — 12-hour, space before AM/PM, Bangla digits, never seconds | **8:58 AM** | `app/school/attendance/mark/mark-form.tsx:43` uses the browser's own locale. See Q6 for সকাল/বিকাল. |
| Units | Space between number and unit: **৫৭ ঘণ্টা**, **৩ দিন**, **৯০%** (no space before %) | **57 hours**, **3 days**, **90%** | "57ঘণ্টায় উত্তর" has no space (audit). |
| File-size / file-type words | **২ MB, ৫০০ KB, PDF, JPG, PNG, WebP** (Latin unit words, Bangla digits) | same | 6 entries already do this (syllabus.intro, syllabus.tooBig, students.photoHint, students.photoTooBig, institute.logoHint, institute.errLogoTooBig); vouchers.tooBig writes "কেবি / এমবি / পিডিএফ" — align it. |

**Money sites in code that bypass the shared helper (owner-facing, verified):**
- `lib/money.ts` — `formatTaka` always writes Latin digits and 2 decimals for any language (`'en-BD'`, min 2 / max 2 digits). Used on school SMS purchase (`app/school/sms/buy/page.tsx:41`) and on every platform-admin page.
- `.toLocaleString()` with no language: `app/school/fees/ledger/page.tsx:233-235`, `app/school/fees/bank/bank-controls.tsx:123`, `app/school/fees/director-capital/director-capital-controls.tsx:38`, `app/school/fees/vouchers/[id]/page.tsx:56`.
- `.toFixed(2)` printed as ৳: `app/school/fees/fee-form.tsx:204, 239, 276-296` and `app/school/fees/receipt/[id]/page.tsx:78-94, 121, 124` (20 sites under school/student).
- Student pages write "৳" in front of `money(...)` (a local formatter; check it honours the language): `app/student/fees/page.tsx:48-96`, `app/student/home-cards.tsx:64`.
- Correct pattern already used: `const tk = (n) => \`৳${fmt.format(n)}\`` with `numberFmt(lang)` in `app/school/fees/page.tsx:217`, `fees/structures/page.tsx:118`, `fees/vouchers/page.tsx:72`, `fees/bank/page.tsx:37`, `fees/director-capital/page.tsx:59`, `fees/assets/page.tsx:71`, `students/page.tsx`, `students/student-drawer.tsx:81`. The fix is to point the remaining sites at the same helper.

Strings in the dictionary that embed units or Latin letters in Bangla text (no digit problem): MB (6 entries listed above), PDF (4: student.fileHint, student.rejectType, syllabus.intro, syllabus.pdfOnly), "Enter" key name (search.hint, rfid.intro), and the acronyms RFID, QR, NID, EIIN, GPA, SMS. Only SMS, GPA are proposed to switch to Bangla script (rows 11 and 15).

---

## 6. Untranslated or leaking strings

### 6a. English text that appears in Bangla mode (hard-coded, bypasses the dictionary)

| What the user sees | File:line | Proposed Bangla (dictionary key to add) |
|---|---|---|
| "Powered by" at the bottom of every page | `components/powered-by-footer.tsx:6` | Use existing `print.poweredBy` ("EdumeBD দ্বারা পরিচালিত") |
| "Visit EdumeBD" (screen-reader label) | `components/powered-by-footer.tsx:7` | "EdumeBD ওয়েবসাইটে যান" (shell.visitSite) |
| "Close menu", "Open menu" (screen-reader labels) | `components/app-shell.tsx:384`, `:422` | "মেনু বন্ধ করুন", "মেনু খুলুন" (shell.closeMenu, shell.openMenu) |
| Fee receipt "কথায়: Three Hundred Taka Only" | `lib/amount-words.ts` (whole file) used at `app/school/fees/receipt/[id]/page.tsx:100` | Bangla number-in-words in Bangla mode: "তিনশত টাকা মাত্র" |
| "End time must be after start time" (red form error) | `app/school/exams/[id]/routine/actions.ts:27` | "শেষের সময় শুরুর সময়ের পরে হতে হবে" |
| Raw database message, e.g. `duplicate key value violates unique constraint "students_roll_unique"` when two students get the same roll | `error: error.message` returns the database text in **125 places in 39 files** under `app/school` and `app/student`, e.g. `app/school/attendance/manual-actions.ts:33,54,70,96,107,132,162`, `app/school/fees/actions.ts:48,72,98`, `app/school/fees/bank/actions.ts:36,76` | Map the known cases (duplicate roll: "এই শ্রেণি ও শাখায় এই রোল আগেই আছে"), and show a general "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" for the rest; log the raw text instead of showing it |
| Validation messages typed as English text in server actions: **229 messages in 40 files** (`app/school`, `app/student`). Most repeated: "Unauthorized" 37, "Name is required" 11, "Class not found" 9, "Date is required" 7, "Student not found" 6, "Item not found or not accessible" 5, "Employee not found" 4, "Amount must be a positive number" 3. Biggest files: `app/school/students/actions.ts` 22, `app/school/attendance/manual-actions.ts` 18, `app/school/classes/actions.ts` 17, `app/school/sms/actions.ts` 15, `app/school/exams/grading-schemes/actions.ts` 14 | (list in group K) | Group K gives the Bangla for the 8 most repeated ones; the rest follow the same pattern: "<noun> আবশ্যক", "<noun> পাওয়া যায়নি". (Some screens, e.g. office-hour and grace-time, already map error codes to Bangla; those are fine.) |

### 6b. Raw internal values shown to the user

| What the user sees | File:line | Proposed |
|---|---|---|
| `student_leave`, `employee_leave` in the Approvals list, drawer and "oldest waiting" card | `app/school/approvals/page.tsx:85`, `:144`; `app/school/approvals/approval-drawer.tsx:28` (value comes from `entity_type`) | Add 2 dictionary keys: `student_leave` → "শিক্ষার্থীর ছুটি" / "Student leave"; `employee_leave` → "কর্মচারীর ছুটি" / "Employee leave". Unknown value → "অন্যান্য" / "Other". |
| `test_two_stage` and `leave_approval` as a workflow name when no label is stored | `app/school/approvals/page.tsx:54`, `:66` (`label.get(key) ?? key` falls back to the raw key) | Fall back to a dictionary word "অনুমোদন" / "Approval", never to the raw key. |

### 6c. English words inside Bangla dictionary strings

| Key | Line | Now (bn) | Proposed |
|---|---|---|---|
| promotion.graduatingHint | 1502 | "…আর্কাইভে… এটি Old Students আর্কাইভে যুক্ত হবে।" | "…এটি আর্কাইভ করা শিক্ষার্থীর তালিকায় যুক্ত হবে।" |
| grading.typeLetter | 1528 | "অক্ষর গ্রেড (Letter)" | "অক্ষর গ্রেড" |
| grading.typeNumeric | 1529 | "সাংখ্যিক (Numeric)" | "সাংখ্যিক" |
| grading.typeGradePoint | 1527 | "গ্রেড পয়েন্ট (GPA)" | "গ্রেড পয়েন্ট (জিপিএ)" |
| markSheet.gpa, markSheet.overallGpa | 1850, 1845 | "GPA" | "জিপিএ" |
| sms.exactRule, sms.addExact | 2533, 2535 | "ঠিক N দিন", "ঠিক N দিনের নিয়ম" (the letter N is shown) | "নির্দিষ্ট দিন", "নির্দিষ্ট দিনের নিয়ম" |
| attendance.offDayLabelField | 2850 | "বিবরণ" (English says Label) | "শিরোনাম" |
| attendance.ingestInfo | 2522 | technical sentence with "POST", "ingest", "token" | stays; shown only to whoever sets up a machine |
| claim.slugInvalid, claim.subdomainHint | 3397, 3404 | "hyphen" | "হাইফেন" (a-z and 0-9 stay Latin) |
| language switch button | `components/lang-switch.tsx:31` | "বাং" (abbreviated) | "বাংলা" |

Platform-admin and distributor screens (`app/super-admin`, `app/distributor`) are written in English with a few Bangla input labels like "লেবেল (BN)"; out of scope here.

---

## 7. Change list (apply mechanically once approved)

Format: `key` — new Bangla (new English, only where English also changes). Only the words that change are shown for long sentences: replace the quoted old word with the new one. Line numbers are in `web/lib/i18n.ts`.

**A. Attendance (term 1)**
- `dash.qaMarkAttendance` — "হাজিরা নিন" (en "Take attendance")
- `attendance.markTitle` — "শিক্ষার্থীর হাজিরা নিন" (en "Take student attendance")
- `attendance.tabMark` — bn unchanged "শিক্ষার্থী হাজিরা" (en "Take attendance")
- `dash.attendanceReport`, `employees.viewAttendance` — "উপস্থিতি দেখুন" (en unchanged "View attendance")
- `attendance.presentRateCard` — bn unchanged (en "Attendance rate"; was "Present Rate")
- `attendance.statRateYtd` — en "Attendance rate (this year)"

**B. Employee / staff (term 2)**
- `dash.staffDirectory` — "কর্মচারী তালিকা" (en "Employee directory")
- `dash.teachersStaff` — "শিক্ষক ও কর্মচারী" (en "teachers & employees")
- `sms.modeGroup` — "শিক্ষক/কর্মচারী/ব্যবস্থাপনা গ্রুপ" (en "Teacher/Employee/Management group")
- `staff.createBtn` — "স্টাফ লগইন তৈরি করুন" (en "Create staff login")
- Leave as is: `staff.*` (other keys), `profile.roleStaff`, `employees.loginLinkHint`, the three `employees.category*Staff/কর্মী` names.

**C. Due / pending (term 3)**
- `exams.alertMarksOverdue` — "নম্বর এন্ট্রির সময় পেরিয়েছে"
- `dash.checklistDue` — bn unchanged "বাকি" (en "Pending"; was "Due")

**D. Seat plan (term 4)** — replace "আসন বিন্যাস" by "সিট প্ল্যান":
- `student.seatPending`, `exams.deleteBody`, `examDocs.seatPlan`, `examDocs.seatPlanHint`, `seatPlan.docWord`
- `seatPlan.print` — "সিট প্ল্যান প্রিন্ট করুন"
- Single seat "আসন" -> "সিট": `student.yourSeat` ("তোমার সিট"), `student.noExamsHint`, `venues.seats` ("সিট")
- Not touched: "আসন্ন" (= upcoming) in 14 keys is a different word.

**E. Class (term 5)**
- "ক্লাস অফারিং" -> "শ্রেণি ও শাখা": `sms.targetOffering` ("নির্দিষ্ট শ্রেণি ও শাখা"; en "Exact class and section"), `sms.classOffering`, `notices.classOffering` ("শ্রেণি ও শাখা"; en "Class and section"), `sms.selectOffering`, `notices.selectOffering`, `notices.targetErrOffering` ("একটি শ্রেণি ও শাখা নির্বাচন করুন"; en "Select a class and section"), `notices.targetOffering`.
- "ক্লাস" meaning a grade group -> "শ্রেণি": `classes.copySubjectsToClass` ("শ্রেণিতে কপি করুন"), `students.loginBulk` ("শ্রেণিভিত্তিক লগইন"), `students.loginBulkTitle` ("পুরো শ্রেণির লগইন"), `students.loginBulkIntro` ("ক্লাস বেছে নিন" -> "শ্রেণি নির্বাচন করুন"), `students.loginBulkNone` ("এই ক্লাসের" -> "এই শ্রেণির").
- Keep "ক্লাস" (lesson): `upcoming.class`, `student.routineTitle`, `student.noRoutine`, `student.noClassesToday`, `student.home.soon`, `routine.title`, `routine.docWord`.

**F. Fee collection (term 6)**
- `dash.qaCollectFee`, `fees.collect` — "ফি আদায়" (en "Collect fee")

**G. School / owner / institute (terms 7, 16, 17, 18, 19)**
- `profile.roleOwner`, `response.owner`, `attendance.weeklyOffDayOwnerOnly` — "স্কুল মালিক" ("প্রতিষ্ঠান মালিক"; the last also "সেটিং" -> "সেটিংস")
- `signup.schoolName` — "স্কুলের নাম"; `profile.school` — "স্কুল" (en "School", was "Institution")
- `response.schoolWide`, `response.introTeacher` — "বিদ্যালয়" -> "স্কুল"
- `machine.setupIntro`, `machine.errShift`, `machine.serviceUpcomingBody`, `classes.educationLevelNotConfigured`, `admitCard.themeHint`, `verify.validNote` — "প্রতিষ্ঠান" -> "স্কুল"
- `teacher.reachNever` — "প্রতিষ্ঠান সেটিংস" -> "প্রতিষ্ঠান সেটআপ"
- Keep "প্রতিষ্ঠান" in: `institute.*`, `venues.movedHint`, `students.previousInstitute*`, `students.admissionStepHistoryHint`.
- `hub.noClasses`, `questions.notYours` — "প্রধান শিক্ষক" -> "স্কুল মালিক" (only if Q2 approved)
- `claim.needAccount` — "সাইন ইন" -> "লগইন"
- `sms.phone`, `feedback.senderContact` — "ফোন" -> "মোবাইল"
- `attendance.offDayLabelField` — "শিরোনাম"

**H. Verb form (section 2)**
- `questions.reply` — "উত্তর দিন"; `response.apply` — "দেখান" (en "Show" -> "Filter"); `corrections.apply` — "প্রয়োগ করুন"
- `hub.noClasses`, `questions.notYours`, `response.introTeacher` — "তোমার" -> "আপনার"
- `myClasses.none` — "আপনি এখনো কোনো শ্রেণির শ্রেণি শিক্ষক নন।"; `myClasses.notLinked` — "আপনার লগইন কোনো কর্মচারী রেকর্ডের সাথে যুক্ত নয়। স্কুল অফিসে যোগাযোগ করুন।"
- Shared pages: `shell.skipToContent` — "মূল অংশে যান"; `notFound.body` — "এসেছ" -> "এসেছেন"; `notFound.home` and `states.goHome` — "হোমে ফিরে যান"
- Student side: `student.noSubjectsYet` — "আপনার" -> "তোমার", "প্রশ্ন করুন" -> "প্রশ্ন করো"; `student.chooseFile` — "ফাইল বেছে নাও"

**I. Archived (term 8)** — "পুরাতন" -> "আর্কাইভ করা" (en "Old" -> "Archived"):
`employees.oldEmployee`, `employees.oldEmployees`, `employees.archiveTitle`, `employees.archiveConfirm` ("পুরাতন তালিকা" -> "আর্কাইভ তালিকা"; en "Old Employees list" -> "archived employees list"), `classes.oldClass`, `classes.oldClasses`, `classes.archiveConfirm`, `students.oldStudent`, `students.oldStudents`, `students.archiveTitle`, `students.archiveConfirm`, `promotion.graduatingTitle` ("আর্কাইভে পাঠান"; en "Graduating batch — \"Archive\""), `promotion.graduatingHint`, `promotion.makeOldSelected` ("নির্বাচিতদের আর্কাইভে পাঠান"; en "Archive selected"), `promotion.markFinalClassHint`.
- `classes.inactive`, `venues.inactive` ("নিষ্ক্রিয়"): `classes.inactive` is not referenced anywhere in `app/`; delete it, or if ever shown use "আর্কাইভ করা" / "Archived". Leave `venues.inactive`.

**J. Leave and off-day (term 9)**
- `upcoming.holiday` — "ছুটির দিন" (en "Off-day"); `upcoming.holidayDefault`, `student.offDay`, `status.holiday` — en "Off-day"
- `student.weekend` — "সাপ্তাহিক ছুটির দিন" (en "Weekly off-day"); `sms.offDays` — en "Off-days"
- `attendance.leaveDaysCard` — "মোট ছুটি (দিন)" (en "Leave days")
- `attendance.tabLeave` — "ছুটির আবেদন" (en "Leave requests"); `attendance.studentLeaveTitle` — "শিক্ষার্থীর ছুটির আবেদন" (en "Student leave requests"); `attendance.employeeLeaveTitle` — "কর্মচারীর ছুটির আবেদন" (en "Employee leave requests"); `attendance.leaveRequestTitle` — bn unchanged (en "New leave request")

**K. Server messages (section 6a)** — new dictionary keys for the 8 most repeated:
"Unauthorized" -> "এই কাজের অনুমতি আপনার নেই"; "Name is required" -> "নাম আবশ্যক"; "Class not found" -> "শ্রেণি পাওয়া যায়নি"; "Date is required" -> "তারিখ আবশ্যক"; "Student not found" -> "শিক্ষার্থী পাওয়া যায়নি"; "Item not found or not accessible" -> "আইটেমটি পাওয়া যায়নি"; "Employee not found" -> "কর্মচারী পাওয়া যায়নি"; "Amount must be a positive number" -> "পরিমাণ শূন্যের বেশি হতে হবে". Plus `routine/actions.ts:27` and the two approvals fallbacks from 6a/6b, and the 125 `error.message` returns.

**L. Exam routine (term 10)** — "সূচি / সময়সূচি" -> "রুটিন" in: `exams.pageSubtitle`, `exams.tableTitle`, `exams.planningTitle` ("নতুন রুটিন ও সিট প্ল্যানিং"), `exams.planningEmpty`, `exams.planningHint`, `exams.checkRoutine`, `examDocs.routineHint`, `student.examsTitle` ("পরীক্ষার রুটিন"; en "Exam routine"), `student.noExams`, `student.noExamsHint`. Office hours: `officeHour.intro` ("…প্রত্যাশিত অফিস আওয়ার নির্ধারণ করুন।"), `officeHour.conflictTitle` ("বিদ্যমান অফিস আওয়ার প্রতিস্থাপিত হবে").

**M. Action labels (section 3)**
- Create: `notices.tabCreate`, `notices.new` — "নতুন নোটিশ" (en "New notice"); `sms.tabCompose` — "বার্তা লিখুন" (en "Write message"); `employees.createTitle` en "New employee"; `bank.create` en "New account"
- Save (bare noun -> verb): `sa.expiry.save`, `graceTime.save`, `review.save`, `routine.save`, `behaviour.save` — "সংরক্ষণ করুন"; en `employees.saveEmployee`, `students.saveAdmission`, `sms.saveDraft`, `attendance.saveAttendance` -> sentence case ("Save employee" ...)
- Filter: `ledger.apply`, `sms.apply`, `institute.apply`, `classes.filter`, `feedback.filter` — "ফিল্টার করুন" (en "Filter"); `schools.apply`, `sub.expired.redeem` — "কোড প্রয়োগ করুন" (en "Redeem code")
- Clear: `table.resetFilters`, `students.clearFilters` — "ফিল্টার পরিষ্কার করুন" (en "Clear filters"); `locations.clearSearch` — "খোঁজা পরিষ্কার করুন"; `table.clearSelection` — "নির্বাচন বাতিল" (en "Clear selection")
- View: `dash.actReview` (en "Review", approvals only), `institute.open`, `students.statView` stay "দেখুন"; `dash.raDescription`, `vouchers.description`, `ledger.description`, `graceTime.exemptionDetails` stay "বিবরণ"
- Delete: `exams.delete`, `exams.deleteConfirm`, `officeHour.remove` — "মুছুন" / "হ্যাঁ, মুছুন"
- Print: `student.printStatement`, `student.printAdmitCard`, `student.printMarkSheet`, `student.printRoutine`, `seatPlan.print`, `students.idCardBulk`, `students.printAdmission`, `students.printIdCard` — "… প্রিন্ট করুন"; `examRoutine.print` — "প্রিন্ট করুন"; `examDocs.printAll` — "একসাথে সব প্রিন্ট করুন"; `examDocs.printablesHint`, `examDocs.printAllHint`, `examDocs.admitCardsHint` ("ছাপা" -> "প্রিন্ট করা"); `fees.collectAndPrint` ("আদায় করুন ও রসিদ প্রিন্ট করুন"); `fees.confirmCollect` ("নিশ্চিত করুন ও রসিদ প্রিন্ট করুন")
- Back: `machine.back` — "ফিরে যান"; `student.backToNotices` — "নোটিশে ফিরে যান"; `students.backToProfile` — "প্রোফাইলে ফিরে যান"
- Pick: `student.chooseFile` (see H); `print.pickClassHelp`, `students.loginBulkIntro`, `machine.errMachineType`, `institute.errConfiguredShiftsEmpty` — "বেছে নিন" -> "নির্বাচন করুন"
- Search: `table.shortcutSearch` — "দ্রুত খুঁজুন"; `resultInquiry.search` — "খুঁজুন"

**N. Small word swaps**
- SMS -> এসএমএস in Bangla text: `sa.nav.sms`, `sa.kpi.smsIncome`, `sa.sms.creditTitle`, `sa.pool.title`, `sa.pool.qty`, `sa.pool.low`, `sa.pool.empty`, `sa.flags.sms`, `sa.flags.smsMetering`, `sms.creditExhausted`, `sms.balance`, `sms.lowBalance`, `sms.balanceEmpty`, `sa.sms.title`, `students.loginSms`
- GPA -> জিপিএ: `markSheet.gpa`, `markSheet.overallGpa`, `grading.typeGradePoint`
- File units: `vouchers.tooBig` -> "ছবি ৫০০ KB, PDF ৫ MB"; `vouchers.badType` unchanged
- Section 6c items (grading.typeLetter, grading.typeNumeric, promotion.graduatingHint, sms.exactRule, sms.addExact, claim.*)
- `components/lang-switch.tsx:31` "বাং" -> "বাংলা"
- Remove the typed "+" from the 13 keys in Appendix B; apply the sentence-case rule to the keys in Appendix A.
- Numbers and money: point the sites in section 5 at `numberFmt(lang)` / `localeOf(lang)`; give `formatTaka` a language argument; add a single date helper.

---

## 8. Questions for the owner (preference only)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Seat: "সিট প্ল্যান" (everyday, majority) or "আসন বিন্যাস" (formal Bangla)? | **সিট প্ল্যান** |
| Q2 | In messages to teachers, the person who runs the school is called "প্রধান শিক্ষক" (2 places) but the English says School Owner. Which name do you want? | **স্কুল মালিক**, same as the role label everywhere else |
| Q3 | Archived lists: "আর্কাইভ করা শিক্ষার্থী" or keep the friendlier "পুরাতন শিক্ষার্থী" (many Bangladeshi schools use this for past students)? | **আর্কাইভ করা**; "পুরাতন" suggests alumni, but passed-out students and students who only left are the same list |
| Q4 | Student portal: stay informal (তুমি/করো) or make it formal like the rest? | **Keep তুমি/করো** for students, formal for everyone else |
| Q5 | Bangla mode: mobile numbers, student numbers and receipt numbers in Latin digits (safe for calling and copying) or Bangla digits? | **Latin for identifiers, Bangla for all other numbers**; make search accept both |
| Q6 | Time: "৮:৫৮ AM" or "সকাল ৮:৫৮" (সকাল / দুপুর / বিকাল / রাত)? | **৮:৫৮ AM** (no custom code); say yes to সকাল/বিকাল only if you want fully Bangla |
| Q7 | Short date: day/month/year "০৩/১০/২০২৬" (Bangladeshi usual) in forms and print, "৩ অক্টো ২০২৬" in tables. Agree? | **Yes** |
| Q8 | Money: lakh grouping "৳১৩,৯৫,০০০" in both languages? | **Yes**, and no decimals unless there are paisa |
| Q9 | "প্রতিষ্ঠান" kept only for the Institute Setup page, "স্কুল" elsewhere. Agree? | **Yes** |

---

## Appendix A. English labels to put in sentence case (484 keys)

Rule: capital on the first word only; keep EdumeBD, Bangla, English, SMS, GPA, RFID, NID, EIIN, PDF, QR, ID, JPG, PNG, WebP. Keys are shown by prefix (`prefix.` then the rest of the key).

`students.`: listTitle, allClasses, oldStudents, newAdmission, behaviourAvg, oldStudent, feeHistorySectionTitle, leaveSectionTitle, admissionTitle, dob, thirdGender, bloodGroup, studentMobile, rollNumberingLink, guardianInfo, guardianName, guardianMobile, benefitFlags, freedomFighterChild, notFreedomFighterChild, notIndigenous, previousInstitute, previousInstituteName, previousClass, siblingInfo, uploadPhoto, replacePhoto, saveAdmission, recentAdmissions, editProfile, archiveTitle, activeList, lastClassSection, archivedOn, transfer, studentNo, transferTitle, backToProfile, transferHistory, fromClassSection, toClassSection, newClass, newSection, confirmTransfer, sigGuardian, sigPrincipal, printAdmission, printIdCard
`institute.`: title, tabProfile, tabChecklist, tabLogistics, tabTemplates, basicInfo, name, instituteCode, mpoEnlisted, mpoCode, centerCode, educationLevels, levelHigherSecondary, academicYearTitle, academicYearCurrentLabel, academicYearNewLabel, academicYearStart, printHeader, logo, rollNumbering, shiftConfiguration, noShift, hasShift, errConfiguredShiftsInvalid, checklistToday, dateRangeReport, addEntry, itemType, storageLocation, templateName, templateAdmission, templateHomework, templateLessonPlan, templateExamAnswer, templateAttendance, instituteName, studentName, homeworkGiven, guardianName, guardianMobile, dob, examTitle, answerSheet
`attendance.`: tabMark, tabLeave, tabOffDays, tabOfficeHour, groupMachine, tabMachineSetup, tabStudentRfid, tabEmployeeEnrollment, statRateYtd, classSection, allClasses, markAllPresent, markAllAbsent, causeCol, saveAttendance, studentLeaveTitle, employeeLeaveTitle, leaveRequestTitle, leaveSubmit, presentRateCard, absentDaysCard, leaveDaysCard, offDayTitle, offDayLegendRegular, offDayLegendSignificant, offDayAddTitle, weeklyOffDayTitle, tabBook, tabEmployee, tabGraceTime, employeeTitle, appliedGraceCol, graceSourceAdHoc, automaticTitle, bookRegisterWord, tabStudentLog, studentLogTitle, viewLog, filterCustom
`fees.`: title, pay, fine, adjust, due, historySectionTitle, tabStructures, tabCollection, academicYear, feeType, oneTimeYearly, newStructure, copyTitle, targetClass, targetYear, copyStructure, notCollected, feeAmount, totalPayable, receivedAmount, calculateFine, collectAndPrint, confirmCollect, tabAssets, tabBank, tabDirectorCapital, tabLedger
`employees.`: academicShifts, createTitle, dob, joiningDate, bankInfo, bankName, bankAccount, categoryQualification, categoryOfficeStaff, categoryHeadTeacher, categoryVicePrincipal, categoryOfficeClerk, categoryMedicalStaff, categoryItTechnician, categorySecurityGuard, categoryTransportStaff, subjectTaught, saveEmployee, editProfile, oldEmployee, oldEmployees, archiveTitle, activeList, archivedOn, allCategories, leaveSectionTitle
`classes.`: title, addClass, classTeacher, addRoom, addSubject, addSubjectTitle, educationLevel, groupDept, academicYear, copyClasses, copySourceLabel, copySubjectsToClass, copySubjectsTitle, targetClass, addClassTitle, groupOtherSpecify, allLevels, allClasses, classCatalogue, roomList, subjectList, oldClasses, oldClass, activeList, archivedOn
`sms.`: title, tabRules, tabLog, recipientGroup, modeClassSection, modeGroup, modeManual, allClasses, allSections, manualNumbersLabel, sendNow, saveDraft, dateTime, totalSent, totalSegments, logAutoGroup, centerTitle
`dash.`: viewAll, checklist, upcoming, totalStudents, totalEmployees, attendanceToday, duesThisMonth, modules, quickActions, qaNewAdmission, qaNewEmployee, qaMarkAttendance, qaCollectFee, qaNewNotice, recentActivity
`sa.`: title, nav.gov, nav.codes, nav.territory, nav.offDays, nav.auditLog, nav.rolePermissions, nav.moduleConfig, nav.subscriptionConfig, nav.jobMonitor, nav.smsCommerce, flags.behaviourAiTriage, gov.title, gov.eduHigherSecondary
`grading.`: title, name, schemeType, typeGradePoint, typeLetter, passMark, passRule, combineGroups, addScheme, manageBands, hideBands, gradePoint, addBand
`exams.`: title, setupIncomplete, startDate, allClasses, allStatus, markEntry, generateSeatPlan, makeRoutine, completeBasicInfoFirst, viewResult, closeModalConfirm, pageTitle
`bank.`: title, new, accountName, withdrawAmount, depositAmount, confirmWithdraw, confirmDeposit, chequeNo, chequeDate, create
`markSheet.`: docWord, studentName, classSection, fatherName, fullMarks, obtained, totalMarks, classTeacher, examController, headTeacher
`officeHour.`: title, addButton, categories, category, startTime, endTime, errEndBeforeStart, errInvalidShift, errInvalidCategory, errDuplicate
`student.`: nav.materials, attendanceTitle, nav.profile, profileTitle, feesTitle, examsTitle, resultsTitle, materialsTitle, routineTitle, home.studentNo
`assets.`: title, allCategories, newTitle, name, purchaseDate, purchaseValue, currentValue, categoriesTitle, addCategory
`admitCard.`: title, docWord, studentName, classSection, fatherName, examCenter, studentSignature, classTeacher
`examDocs.`: title, routine, seatPlan, admitCards, attendanceSheet, printables, resultBook, printAll
`feedback.`: tabRatings, allStatus, statTotal, avgRating, totalResponses, responseRate, distribution, byCategory
`graceTime.`: standingTitle, addRule, graceDetail, categoryDetailsCol, graceTimeCol, noRules, adHocTitle, noExemptions
`machine.`: setupTitle, type, model, serial, location, downloadService, enrollStudents, enrollEmployees
`seatPlan.`: title, rollRange, studentCount, overCapacity, generate, docWord, rollStart, rollEnd
`examSetup.`: title, basicInfo, gradingScheme, subjectTeacher, assignedTeacher, fullMarks
`gallery.`: newAlbum, allAlbums, uploadPhotos, statAlbums, statPhotos, statFull
`examAttendanceSheet.`: title, docWord, studentName, classSection, examController
`home.`: school, distributor, agent, student, gov
`promotion.`: title, promoteSelected, currentRoll, newClass, newRoll
`vouchers.`: allTypes, newTitle, voucherNo, categoriesTitle, addCategory
`directorCapital.`: title, runningBalance, confirmInvest, confirmWithdraw
`examRoutine.`: title, docWord, startTime, endTime
`graceDetail.`: Lunch Hour, Prayer & Tiffin, Transport Delay, Special Duty
`notices.`: tabGallery, allTypes, colTarget, targetSpecific
`progressReport.`: title, docWord, behaviourRating, ratingNeedsImprovement
`syllabus.`: title, existing, currentFile, uploadedOn
`cocurricular.`: title, itemsTitle, entryTitle
`ledger.`: title, sourceFeeCollection, sourceDirectorCapital
`material.`: lesson_plan, daily_lesson, exam_prep
`shell.`: addStudent, shiftSelection, academicYearSelection
`codes.`: title, price
`combinations.`: title, members
`nav.`: groupAcademics, groupFinanceComms
`partners.`: title, gov
`profile.`: title, roleOwner
`response.`: title, owner
`resultBook.`: title, totalMarks
`resultInquiry.`: title, allSubjects
`routine.`: title, docWord
`status.`: on_leave, holiday
`subjects.`: title, assignAll
`activity.`: title
`app.`: tagline
`behaviour.`: title
`corrections.`: title
`dist.`: nav.crm
`hub.`: title
`locations.`: title
`markEntry.`: title
`myClasses.`: title
`print.`: qr
`printAll.`: title
`printables.`: title
`questions.`: title
`rfid.`: card
`schools.`: title
`signup.`: title
`staff.`: title
`territory.`: mySchools

## Appendix B. Labels that start with a typed "+"

`dash.qaNewAdmission`, `dash.qaNewEmployee`, `classes.addClass`, `classes.addRoom`, `classes.addSubject`, `fees.newStructure`, `vouchers.addCategory`, `assets.addCategory`, `bank.new`, `directorCapital.invest`, `directorCapital.withdraw`, `institute.addEntry` (each in Bangla and English). `attendance.moreCount` ("+{n} more") is a count, not a button: keep.
