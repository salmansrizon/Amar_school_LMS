# Wave 2 browser test: notices and student portal

Tested 2026-10-08 on `2e930672` (tip of `merge/staging-sync`), dev server on port 3743, Playwright (Chromium), Test School A only. Every statement below is something seen in the browser unless it says "code reading".

Verdicts: VERIFIED, PARTLY, FAILED, NOT TESTED.

## Preparation

- Admitted `W2-NOT Student One` (roll 90, student no. 9294) into `UXA-Att 1790996221552 - A — 2032`, the only class the admission form offers. Profile: `/school/students/b85b8f59-bdca-4c4f-ac2d-f17d1009fece`.
- Created a student login from the profile. No guardian phone was entered, so the SMS checkbox was not offered. No SMS sent.

## 1. #696 unpublish / republish: VERIFIED (one part PARTLY)

Notice `W2-NOT Notice Alpha` (`13217b0e-899b-4304-bcf7-1257475da573`), target "specific class offering" = the class above.

| Step | Seen |
|---|---|
| Published, student | In `/student/notices`, on `/student`, and at `/student/notices/<id>` |
| Unpublish | Confirm dialog: "এই নোটিশের প্রকাশ বন্ধ করবেন? শিক্ষার্থীরা এটি আর দেখতে পাবে না। পরে আবার প্রকাশ করা যাবে।" with বাতিল / প্রকাশ বন্ধ করুন. Cancel leaves the notice published. Confirm: toast "নোটিশের প্রকাশ বন্ধ করা হয়েছে" |
| Unpublished, owner | Chip "অপ্রকাশিত" / "Unpublished" on the list row and on the detail; the button becomes "আবার প্রকাশ করুন" / "Republish". Seen in Bangla and English at 1440px and 390px, no horizontal scroll, no console errors |
| Unpublished, student | Not in the notices list, not on the home, direct URL shows the 404 page ("পাতাটি পাওয়া যায়নি") |
| Republish | Toast, chip gone, button back to "প্রকাশ বন্ধ করুন"; student sees it again in the list, on the home and at the direct URL |
| Homework, lesson plan, exam prep | Detail page and list drawer of existing DEMO rows show only সম্পাদনা / মুছুন. No Unpublish control. (Viewed only, not changed.) |

Notes:

- **Original date: PARTLY.** The date shown before and after republish is the same (৮ অক্টো ২০২৬), but the notice was created, unpublished and republished on the same day and the pages show the day only. This does not prove `created_at` is untouched.
- The direct URL of an unpublished notice answers HTTP 200 with the 404 page body (dev server). The student sees a 404 page; the status code is not 404.
- The class already holds other fixture students (`UXA-Att`, `DEMO`): they saw the `W2-NOT` notice while it was published.

## 2. 5.4 threads: VERIFIED (owner side; class teacher NOT TESTED)

As the student, general question on subject `UXA-Acad Eng 10030858`, title `W2-NOT Thread Title`:

| Step | Seen |
|---|---|
| Question 1 "W2-NOT first question body" | One row, Messages = ১ |
| Follow-up "W2-NOT follow-up one" from the conversation popup | Popup timeline shows both messages in order; the list still has one row, Messages = ২ |
| Question 2 "W2-NOT second unrelated question", SAME title and SAME subject | A second, separate row (Messages = ১). The first row keeps Messages = ২. Not merged |
| Owner inbox `/school/questions` | Three rows (one per message). Drawer of the follow-up shows the heading "এই আলোচনার অন্য বার্তা" / "Other messages in this conversation" with the first question under it. Drawer of the first question lists the follow-up. Drawer of the same-title second question lists nothing |

Student list and owner drawer seen in Bangla and English at 1440px and 390px: no horizontal scroll, no console errors.

Not tested: the class-teacher fixture (`teacher-e2e@test.local`) does not reach this class. Her inbox showed 0 `W2-NOT` rows, so the teacher's drawer was not seen. I did not change who teaches the class (not my record).

## 3. 5.6 several replies: VERIFIED

Owner, drawer of "W2-NOT follow-up one":

- First reply "W2-NOT reply ONE": saved, row status becomes "০ঘণ্টায় উত্তর", the drawer now offers "আরও একটি উত্তর যোগ করুন" / "Add another reply" with a `০ / ৪,০০০` counter.
- Second reply "W2-NOT reply TWO" through that form: after a reload the drawer shows reply ONE, then reply TWO (with its time), then the form again. Reply ONE is unchanged.
- Student timeline, in order: first question, follow-up, "শিক্ষকের উত্তর … W2-NOT reply ONE", "শিক্ষকের উত্তর … W2-NOT reply TWO". The conversation status stays "শিক্ষকের উত্তর" and Messages goes ৩ then ৪.
- Owner drawer seen in English at 1440px and Bangla at 390px: no horizontal scroll, no console errors.

Observation, not a defect of this item: the reply was given on the follow-up, so the original message of the same conversation ("W2-NOT first question body") stays in the owner inbox as unanswered with a "উত্তর দাও" pill, while the student sees the whole conversation as answered.

## 4. 5.2 new reply mark: VERIFIED

- Before any reply: no mark.
- After reply ONE, without opening the conversation: the row status reads "শিক্ষকের উত্তর নতুন উত্তর" ("New reply" in English). Seen in Bangla and English at 1440px and 390px.
- Still marked after reply TWO.
- After opening the conversation popup and reloading the list (twice): the mark is gone.
- The same-title second question never carried the mark.

## 5. 5.5 length limit: VERIFIED

- Counter under the question editor: `০ / ৪,০০০`, `১০ / ৪,০০০` after ten typed characters (English: `0 / 4,000`). Also on the follow-up editor and on the owner's "Add another reply".
- Typing or pasting 4001 characters: the field stops at 4000 (the browser limit on the textarea), so a student cannot reach the refusal by typing.
- With the browser limit taken off the field by the test script, 4001 characters: counter `৪,০০১ / ৪,০০০`, the send is refused with "প্রশ্নটি অনেক বড় — ৪০০০ অক্ষরের মধ্যে লেখো।" (English: "The question is too long — keep it within 4000 characters."), and no row is added. Seen in Bangla at 1440px and 390px and English at 1440px.
- Exactly 4000 characters (Bangla letters): "প্রশ্ন পাঠানো হয়েছে।", a new row appears, the popup shows the 4000-character body.

Not tested: the database CHECK (0256) on its own. The app refuses first, and no SQL was run.

## 6. 5.8 withdraw: VERIFIED

- Unanswered question, popup: button "প্রশ্ন তুলে নাও". Confirm dialog: "এই প্রশ্নটি তুলে নেবে? এটি মুছে যাবে এবং শিক্ষক আর দেখতে পাবেন না।" (English: "Withdraw this question? It will be deleted and your teacher will no longer see it."). Cancel keeps the question.
- Confirm: toast "প্রশ্নটি তুলে নেওয়া হয়েছে"; the row is gone from the student list; its `?view=` no longer opens a popup; it is gone from the owner inbox (7 rows to 6) and the owner drawer for its id does not open. Done three times (Bangla 1440px, English 390px twice).
- Answered conversation: the popup has no withdraw button.
- Follow-up asked after the answer: withdraw is offered for that follow-up only. After withdrawing it, the answered message and both replies are still in the timeline.

Minor: after a withdraw the address bar keeps `?view=<deleted id>`. Nothing is shown for it and there is no error.

## 7. Machine sync read side (#694 part): VERIFIED

`/school/attendance/machine` as owner, Bangla and English, 1440px and 390px: HTTP 200, the page renders (tabs, new-machine form, registered machines table), no error overlay, no console errors, no horizontal scroll. No line on the page mentions a sync or the Agent: no "last synced" line and no warning.

Not tested: the positive case (a heartbeat exists). Nothing writes a heartbeat today and no SQL was run. The warnings on the Employee Attendance pages were not looked at.

## 8. Regression of the three evaluation fixes: VERIFIED (two of three; the third was not identified)

- Direct load of `/student/questions?view=<id>` (fresh navigation, Bangla 1440px and English 390px, and many more times during items 2 to 6): HTTP 200, the popup opens, no console error, no error overlay. The dev server log holds 0 occurrences of "document is not defined".
- Multi-line question (`W2-NOT Multiline`: three single-line-break lines, a blank line, a paragraph, a two-item list). Editor preview and stored render in the popup have the same structure: one `<p>` holding the three lines separated by `<br>`, a second `<p>`, then a `<ul>` with two `<li>`. Single line breaks did not become paragraphs.
- The brief names two fixes; the third was not named, so it was not tested as such.

## Records created (Test School A)

| Record | State |
|---|---|
| Student `W2-NOT Student One` (roll 90, no. 9294) with a student login | Kept |
| Notice `W2-NOT Notice Alpha` | Kept, published |
| Conversation `W2-NOT Thread Title`: first question, follow-up, replies ONE and TWO | Kept (answered, cannot be withdrawn) |
| Question `W2-NOT Thread Title` / "second unrelated question" | Kept, unanswered |
| Question `W2-NOT Multiline` | Kept, unanswered |
| Questions `W2-NOT Len 4001` (two) and `W2-NOT Len 4000`, each 4000 characters | Removed (withdrawn as the student) |
| Follow-up "W2-NOT follow-up after answer" | Removed (withdrawn) |

The two `Len 4001` questions were created by mistake: the test tool's fill stopped at the field's 4000 limit, so they were sent as valid 4000-character questions. No SMS was sent, no payment recorded, no exam touched, no record of anyone else edited or deleted.

## Checks

- Browser only. No code was changed, so `tsc` and the unit tests were not run. No defect needed a fix.
- jev_verify (jev-1.13.0) on 12 claims: 10 verified, 2 unsupported, 3 flagged for review.
  - Verified, auto: unpublish hides / republish restores (0.95), chip and no control on other kinds (1.0), one row per conversation and same title separate (0.92), owner drawer lists earlier message (0.98), two replies in order (1.0), new reply mark set and cleared (0.83), withdraw (1.0), machine page (1.0), direct load and multi-line render (0.98).
  - Verified, review: 4001 refused / 4000 accepted (0.59). The evidence also says typed input stops at 4000, which reads as a partial conflict; the refusal was seen only with the browser limit removed.
  - Unsupported, review: "the class teacher fixture saw the earlier messages" (the deliberately false control; relation: contradicted 0.98).
  - Unsupported, review: "the test proved republish keeps the original creation time" (0.59). Matches the PARTLY note in item 1.
