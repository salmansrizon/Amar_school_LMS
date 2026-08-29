# Exam System — UI Reorganization

Please make a UI-only reorganization of the existing Exams & Results area.

First inspect the current exam pages, routes, UI patterns, permissions and existing logic. Reuse everything already working. Do not rebuild pages, change exam/result logic, alter the database unnecessarily, or over-engineer.

## Main Exams & Results Tab

### Keep

- Existing Create Exam section
  - Exam Name
  - Year
- Existing exam filters/list

### Exam Row Actions

For each exam row, replace the current mixed actions with only:

- Basic Info
- Mark Entry
- Co-Curricular
- Documents

Make these actions clean, compact, responsive and consistent with the existing UI.

## 1. Basic Info

Clicking **Basic Info** should open the existing exam edit page, but treat it as the focused exam configuration page.

Keep the existing controls for:

- Exam Name
- Year
- Class
- Start Date
- Grading Scheme
- Subject Teachers

Also keep/move these two existing actions inside the Basic Info page:

- Promotion
- Close Exam

Do not remove or rebuild their functionality. Simply place them appropriately inside Basic Info using the existing routes/actions.

Promotion and Close Exam should no longer appear directly on the exam list row.

### Remove

Remove the other unrelated shortcuts currently mixed into the edit page, such as:

- Exam Routine
- Seat Plan
- Marks Entry
- Co-Curricular
- Admit Card Preview
- Result Book
- Printable
- Print All / Batch Print

Also remove the existing bottom Exam Documents card from Basic Info.

## 2. Mark Entry

Clicking **Mark Entry** should directly open the existing Mark Entry page for that exam.

Do not create a new page.

## 3. Co-Curricular

Clicking **Co-Curricular** should directly open the existing Co-Curricular page for that exam.

Reuse the current page and logic.

## 4. Documents

Clicking **Documents** should open a polished modal/popup titled **Exam Documents**.

Show these existing destinations:

- **Exam Routine** — Dates, times and subjects, laid out for the notice board. `Open`
- **Seat Plan** — Room-by-room seating with each room's combined roll list. `Open`
- **Admit Cards** — One per student, printable individually or for the whole exam. `Open`
- **Attendance Sheets** — One invigilator sheet per room per subject sitting. `Open`
- **Mark Sheets & Progress Reports** — Pick a student and print their result documents. `Open`
- **Result Book** — The whole class's results in one book. `Open`
- **Batch Print** — Print for every student at once, filtered by roll range. `Open`

These pages already exist. Only connect the modal to existing routes/pages. Do not rebuild them.

## Dependency Rules

If required Basic Info is incomplete, such as:

- Class not configured
- Grading Scheme missing

then disable:

- Mark Entry
- Documents

Use the actual existing exam data to determine this. Do not invent a new workflow/state system.

Show a subtle explanation such as: *"Complete Basic Info first"*.

- Basic Info must always remain accessible.
- Co-Curricular should follow existing requirements; do not unnecessarily disable it.

## Important Clarification

Promotion and Close Exam belong inside Basic Info for now. Do **NOT** move them to Multi Exam Combination / Exam Tuning & Publish in this task.

The current Multi Exam Combination area will be handled separately later.

## Important Rules

- This is primarily a UI organization/navigation cleanup.
- Respect the existing UI.
- Reuse existing pages, routes and components.
- Preserve all business logic.
- Preserve exam calculations and result behavior.
- Preserve school/tenant authorization.
- Preserve i18n, responsive layout and dark mode.
- Do not duplicate pages.
- Do not introduce unnecessary database/schema changes.
- Do not perform unrelated refactoring.
- Do not over-engineer.

## Process

Before modifying code, briefly identify:

1. Existing routes/pages you will reuse.
2. Files likely to change.
3. How Basic Info completeness will be determined.

Then implement the changes fully and test navigation.

## Report

At the end report only:

- What changed
- Important files changed
- Tests performed
- Any actual remaining issue
