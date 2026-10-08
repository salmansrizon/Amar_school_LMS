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
