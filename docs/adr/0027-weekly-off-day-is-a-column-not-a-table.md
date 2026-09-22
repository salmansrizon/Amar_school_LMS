# Weekly Off-Day is a column on `schools`, not a dedicated table

**Status**: accepted

`off_days` (school_id, day) already exists for dated, one-off Off-Days — public holidays, exam gaps — each optionally labeled and independently created/deleted. Weekly Off-Day is a different shape: a small, fixed-size set (at most 7 weekdays) that is always replaced wholesale on save, never labeled, never significant, never queried by anything except "is this weekday off." That shape matches `schools.configured_shifts` (ADR-adjacent precedent, migration 0176: `text[]` + `CHECK`, replaced wholesale, no per-row metadata) far more closely than it matches `off_days`' arbitrary-many, individually-labeled, date-keyed rows.

Grilled against mirroring `off_days` with a new `weekly_off_days` (school_id, weekday) table: rejected. A table optimizes for individually addressable rows with their own lifecycle, which this concept doesn't have — every write replaces the whole set, and nothing ever reads or deletes a single weekday in isolation. A table would need the same "delete-all-then-insert-selected" transaction a column's array-replace gets for free, plus a join that a column read on `schools` doesn't need at all.

## Considered options

- **A — New table `weekly_off_days` (school_id, weekday), same shape as `off_days`.** Rejected: no row in this table is ever individually created, labeled, or deleted — the set is always replaced atomically, which is array-replace semantics wearing a table's clothes.
- **B — `schools.weekly_off_days smallint[]` with a `CHECK` constraining values to 0–6 (chosen).** Matches the existing `configured_shifts` open-vocabulary column pattern; `dayOffInfo()` reads it directly off the already-loaded School row with no extra join.

## Consequences

- Existing Schools must default to `{6}` (Saturday) on migration, not `{}` — the column replaces a hardcoded universal assumption, so an empty default would silently remove off-day shading for every School that hasn't touched the new setting yet.
- If a future need arises for per-weekday metadata (a label, an effective-date range), this column doesn't support it and would need to become a table then — deferred because no such need exists today.
