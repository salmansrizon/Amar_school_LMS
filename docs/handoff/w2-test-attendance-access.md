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

