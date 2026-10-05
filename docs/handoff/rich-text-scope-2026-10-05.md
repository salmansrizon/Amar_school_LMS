# Rich text scope, 2026-10-05

Editor `RichTextField`, renderer `Markdown`, plain text `markdownToPlainText` (`web/lib/rich-text.ts`).

| Field | Form | Column | Display sites | Consumers | Class | Reason | jev |
|---|---|---|---|---|---|---|---|
| Student question / follow-up | `app/student/questions/*` | `student_messages.body` | student timeline, teacher drawer (Markdown); teacher list preview | none | has editor; list preview fixed | preview now plain text | n/a |
| Teacher reply to a question | `app/school/questions/reply-form.tsx` | `student_messages.reply_body` | teacher drawer, student timeline (Markdown) | none (no SMS, print, export, notification) | ADD, converted | long-form, every site renders Markdown | verified 0.99 |
| Notice / homework / lesson body | `app/school/notices/new/create-form.tsx` (+edit) | `publications.content` | school notice detail + drawer, student notice detail, student task detail, student materials 2-line cell | none found, but negative claim | needs owner decision | jev verified at only 0.74 and 0.75 (< 0.8), not converted. Would need Markdown at 3 sites and `markdownToPlainText` at `app/student/materials/page.tsx:62` | 0.74 / 0.75 |
| Leave reason, rejection | `student/leave/leave-form.tsx`, `attendance/leave/leave-controls.tsx` | `*.reason` | table cells, drawers, `matchesQ` search | search key | NO | short reason, search key | n/a |
| Behaviour note | `students/[id]/behaviour-controls.tsx` | `note` | profile | `behaviourSmsBody` SMS | NO | SMS carries raw marks | n/a |
| SMS compose | `sms/compose-form.tsx` | sms log | SMS | is the SMS | NO | | n/a |
| Feedback body | `feedback/feedback-controls.tsx` | `feedback_messages.body` | list, drawer | none | NO | transcription of an outside message | n/a |
| Feedback reply | same | `reply_body` | drawer | `emailGateway().send(..., replyBody)` | NO | emailed as plain text | n/a |
| Transfer note | `transfer/transfer-form.tsx` | record | student record | official record | NO | | n/a |
| Admission sibling info | `admission-form.tsx` | `sibling_info` | admission print | admission print | NO | printed official document | n/a |
| Machine setup | `attendance/machine/machine-setup.tsx` | config | settings | device | NO | technical | n/a |

No separate input found for exam/class remarks, fee notes, profile correction notes or ledger narration (ledger text would be NO: accounting record).
