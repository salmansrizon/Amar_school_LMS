# Student demo data (Test School A) - 2026-10-05

Every record is prefixed DEMO. Created through the app as owner-a@test.local / seed student.

| # | What | Exact name | Id | Created on | How to remove |
|---|------|-----------|----|-----------|---------------|
| - | (exam probe, already removed) | DEMO মডেল টেস্ট | abcaf968-37b8-4bc8-8897-101b8034cb58 | /school/exams | Created, then found the Class picker cannot offer "Seed Class - A" (year filter), so it was deleted again via the exam page Delete button. Nothing remains. |
| 8 | Leave request (pending), 12-13 Oct 2026 | reason "DEMO পারিবারিক অনুষ্ঠান" | (not in URL) | student S9001 at /student/leave | Same page, "আবেদন ফিরিয়ে নাও" (withdraw) button on that row. |
| 9 | Student question (unanswered), subject XS1 Physics (only subject offered) | DEMO ভগ্নাংশ যোগ | (not in URL) | student S9001 at /student/questions | No delete in the app for students - database only (owner can see it at /school/questions). |

## Skipped (not created)
Seed Class - A is a 2026 class; the school's active year is 2032 and the owner/teacher UI only offers 2030-2032 classes (year filter). So the Notice/Homework target picker, Class Routine picker, Exam class picker, Mark Attendance roster and Students list/Fee collection cannot reach Seed Class - A or seed student S9001. Study material needs a PDF upload (syllabus) or the same class target. Homework due dates have no field on the form. Item 10 skipped (no DEMO task).

## Added 2026-10-05 (second pass) — school-wide in Test School A

The owner approved posting DEMO homework and notices to the whole test school, because the seed student's class (year 2026) cannot be targeted from the owner pages (active years 2030–2032). Created through `/school/notices/new` as the owner. **Every student of Test School A sees these until they are removed.** No SMS: the publish action sends none.

| # | Type | Importance | Exact title | How to remove |
|---|------|-----------|-------------|---------------|
| 1 | Homework | Normal | DEMO গণিত অনুশীলনী ৩.২ | `/school/notices` → open the item → Delete |
| 2 | Homework | Normal | DEMO বাংলা রচনা: আমার গ্রাম | same |
| 3 | Homework | Normal | DEMO ইংরেজি Paragraph: My School | same |
| 4 | Homework | Normal | DEMO বিজ্ঞান: উদ্ভিদের অংশ | same |
| 5 | Homework | Normal | DEMO সাধারণ জ্ঞান কুইজ প্রস্তুতি | same |
| 6 | Notice | Urgent | DEMO জরুরি: আগামীকাল অভিভাবক সভা | same |
| 7 | Notice | Normal | DEMO বার্ষিক ক্রীড়া প্রতিযোগিতা | same |
| 8 | Notice | Normal | DEMO গ্রন্থাগারের নতুন সময়সূচি | same |

None of the homework has a due date: the app has no field for one (issue #705).

## Coverage after the second pass (student S9001, Bangla, 1440px)

| Page | Has data | What shows |
|---|---|---|
| Home — "needs you now" | yes | urgent notice, pending leave, 2 new notices |
| Home — stat cards | partly | homework 5; result 72/100 rank 1/1; fees ৳0 all paid; attendance "—" |
| Tasks | yes (6 rows) | all "later" — no overdue / due-soon state possible (#705) |
| Notices | yes (5 rows) | one urgent, unread marks |
| Leave | yes (1 row) | pending |
| Questions | yes (12 conversations) | answered, waiting, one with a follow-up |
| Results | yes (1 row) | raw marks only (#702) |
| Fees | thin (1 paid month) | no due or overdue month |
| Exams | no | no exam schedule |
| Routine | no | routine not published |
| Attendance | no | no attendance taken this month |
| Materials | no | none |
| Notifications | no | none |

## Added 2026-10-05 (third pass)

| # | Type | Importance | Exact title | How to remove |
|---|------|-----------|-------------|---------------|
| 9 | Notice | Normal | DEMO পরীক্ষার প্রস্তুতি নির্দেশনা (id `17a67723-ea13-47dc-bea1-cb1011a26bbb`) — formatted body: heading, list, code block, link | `/school/notices` → open the item → Delete |

School-wide, like items 1–8. Created to show the rich-text body; edited once to remove test text.
