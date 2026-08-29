---
status: accepted
supersedes: the "both axes must pass" clause of ADR-0018
---

# A class attachment narrows a Grant, and the employees row is the signal

This is the fourth decision about one question — who may see which children — and it exists to be the last. ADR 0016 proposed a per-instance workflow approver and was never built. ADR 0017 replaced it with two axes. ADR 0018 restated them and moved reading into RLS for two queues. None of the three said what happens when **both axes are present and disagree**, and that gap is what shipped.

`students` kept 0024's `school_id = app_current_school_id()`. A UAT pass found a Class Teacher assigned to one class reading all 82 children of her school across 39 class/section combinations. She held the `students` grant, so under the rule as written she was entitled to them: ADR 0018 says both axes must pass for a school-wide surface, but never says an attachment *subtracts* from a Grant.

**It subtracts.** A Grant says which screens. An attachment says which children. Where a caller has an attachment, it is a ceiling, not a floor.

## The employees row is the signal, not the attachment

The obvious implementation keys the narrowing on *having an attachment*, and it is wrong. A teacher who has been given a class but not yet placed on the routine has no attachment; she would become indistinguishable from a clerk and receive the whole school. That is the silent, student-facing footgun ADR 0017 was written to remove, reintroduced one layer down.

`employees.profile_id` is already this codebase's definition of who is not office staff — 0152 says so in as many words. So the rule keys on that seam rather than inventing a second one:

| Caller | Students |
| --- | --- |
| School Owner | the whole school |
| Staff with no `employees` row — the office login | the whole school; there is nothing to narrow by, and the Owner said so by granting |
| Class Teacher | students of classes where `classes.class_teacher_id` is her employee row |
| Subject Teacher | students of classes where he appears in `routine_slots.teacher_id` |
| Both hats | the union of his own attachments, never a widening back to school-wide |
| Employee with no attachment | **nothing** |

The failure mode is *less* access. That is the whole point: an Owner who assigns Karim Sir to 6-A has already said what they mean, and a permissions screen is only a second chance to get it wrong.

## The last row is a cost, not an oversight

An Employee with no attachment reads no students. On its own that renders as "No students yet" in a school of hundreds, which reads as a broken product rather than a missing assignment. Every screen narrowed this way must distinguish *empty* from *unassigned* and name the Owner as the way out. `lib/school/class-scope.ts` answers that question, and only when a list actually comes back empty.

## No grant term on `students`

Requiring `app_module_granted('students')` in the row predicate is tempting and would be wrong. Attendance, fees, exams, SMS and search all read `students`, and office staff hold those grants without holding `students` — a clerk granted `attendance` only would lose the roster. Screen access stays the proxy's job (ADR 0020); this decision is about which rows, not which screens.

## Consequences

- **`classes` splits.** Reading stays school-wide, because every class picker reads it and a class *name* is not a child's record. Writing requires the absence of an `employees` row, so catalogue deletion no longer arrives with a teaching assignment.
- **An Employee cannot admit a student.** `WITH CHECK` runs before the row exists, so the capacity walk returns null for anyone with an `employees` row. Admission is Owner and office work, and a Class Teacher creating students in her own class was never a workflow this product offers.
- **`behaviour_log_entries` and `student_subjects` follow `students`.** Both were reachable for another class's child from the same detail page.
- **UI reduction is downstream, not a substitute.** Navigation and action surfaces should shrink to match, but the boundary is in RLS and is tested there (#542).

## Considered and rejected

- **Union of the axes (the shipped behaviour).** One fewer concept, and a part-time teacher holding `students` reads every child in the school.
- **Keying on the attachment rather than the employees row.** Closes the reported hole and opens a quieter one, above.
- **A grant term on the row predicate.** Breaks the roster for office staff holding a neighbouring grant — a wider blast radius than the defect it fixes.
