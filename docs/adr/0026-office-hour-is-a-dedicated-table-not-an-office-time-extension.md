# Office Hour is a dedicated table, never an extension of Office Time

**Status**: accepted

`office_times` already exists (issue #102, `0061_office_time_rename.sql`) as a per-Employee attendance-grace window: an Employee is individually toggled onto zero or more named Office Times, each optionally carrying `starts_at`/`ends_at` (unused by any UI today) and a `grace_minutes` feeding `effective_grace_minutes`' MAX-across-levels calculation. Office Hour answers a different question: "what hours does this School expect this Employee Category to keep, on this Day, under this Shift" — a School-wide *published* schedule, not an individual attendance input. The two share only surface vocabulary (both are "a name plus a time window"), which is exactly why the new feature could not simply extend `office_times`: doing so would bolt a Category+Shift+Day identity onto a table whose entire existing identity and RLS/grace-calculation machinery is keyed to individual assignment via `employee_office_times`, corrupting `effective_grace_minutes` and every attendance-reconciliation query that already treats one `office_times` row as one individually-assignable window.

Grilled explicitly against reusing/extending `office_times`: rejected, because the two concepts' identities are fundamentally different shapes (individual-assignment vs. category-wide-publish) and no code path needs them to interoperate — an Employee's attendance lateness is never computed from Office Hour, and Office Hour never needs to know which individual Employees exist.

## Considered options

- **A — Add `employee_category`/`shift`/`day_of_week` columns to `office_times`, reuse `employee_office_times` some other way.** Rejected: `office_times` rows are individually assigned; giving a row both an individual-assignment meaning and a category-wide-broadcast meaning at once has no clean semantics, and would force every existing `effective_grace_minutes`/attendance-reconciliation consumer to filter around rows that no longer mean what they used to.
- **B — New dedicated table `category_office_hours` (chosen).** Independent schema, independent RLS, independent lifecycle (hard delete, no grace/attendance interaction) — the two features evolve without either constraining the other.

## Consequences

- `category_office_hours` and `office_times` remain permanently unrelated tables; a future feature wanting to reconcile "is this Employee currently inside their Category's published Office Hour" against actual attendance would need new join logic — there is no shared foreign key or shared identity between the two today.
- Naming risk is real and intentionally managed at the UI/vocabulary layer, not the schema layer: the user-facing label "Office Hour" is deliberately distinct from "Office Time" so School Owners and future developers don't conflate the two; CONTEXT.md documents both terms side-by-side with an explicit cross-reference.
- Office Hour's Shift dimension reads `schools.configured_shifts` directly (the same raw-list pattern already used by `employees/new/page.tsx` for Employee Shift assignment), never the topbar's per-user Global Shift Selection cookie — consistent with `configured_shifts` being documented (migration 0176) as the "authoritative available-shift-vocabulary source," of which the topbar selection is just one, narrower-scoped consumer.
