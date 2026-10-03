# A grace rule's Shift is display-only, not an applicability filter

**Status**: accepted

Standing Grace Rules and Ad-Hoc Grace Exemptions each carry a Shift, and a Standing Grace Rule is unique per Shift + Grace Detail. Despite that, the Shift does **not** narrow which Employees a rule applies to: the Considerable Grace Window's MAX rule takes every rule whose Categories include the Employee's Category, whatever Shift the rule is filed under and whatever Shifts the Employee is assigned (`employee_academic_shifts`). So a Morning "Prayer 20" covering Teacher and a Day "Prayer 30" covering Teacher give *every* Teacher 30 minutes.

The Shift exists to organise the Grace Time screen the same way Office Hour is organised (a local Shift picker and Shift filter over the School's raw `configured_shifts`), not to change the calculation.

## Considered options

- **A — Shift gates applicability.** A rule applies only to Employees assigned to its Shift; an Employee in several Shifts gets the MAX across them. More precise, but it makes grace depend on Shift assignment data that many Employees don't have yet, and a School with Employees missing a Shift would silently lose their grace.
- **B — Shift is display-only (chosen).** Grace depends only on Employee Category, as it did before this redesign. The School Owner chose this explicitly.

## Consequences

- A per-Shift difference in grace for the same Category can't be expressed today. The larger value always wins for everyone in that Category.
- If Shift-gating is ever wanted, the rule data already carries Shift, so only the MAX-rule SQL (`effective_grace_*`, `reconcile_attendance`) and `lib/grace.ts` need to change. No data migration is required.
