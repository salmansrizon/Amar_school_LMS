# Employee Category's foreign keys target `employee_categories.name`, not `.id`

**Status**: accepted

`employees.category`, `category_grace_minutes.category`, and `category_office_hours.employee_category` are all `text`, matched against each other by exact string equality with no DB-level integrity today — `category_grace_minutes.category` in particular has no application validation either, so a typo there silently creates a grace row that matches no Employee. `employee_categories (id uuid, name text unique)` exists to close that gap and give future Attendance work a clean table to reference.

The three existing columns keep their `text` type and gain a foreign key against `employee_categories.name` (a unique, non-primary-key column — Postgres allows this) instead of being converted to a `category_id uuid` column. Grilled explicitly against the id-based conversion: rejected, because `EMPLOYEE_CATEGORIES` (`web/lib/employees.ts`) stays the live application source for every dropdown and validator (a deliberate, separate decision — the DB table is an integrity anchor, not a replacement vocabulary), so nothing in the app ever needs a category's id for display, filtering, or SMS/satisfaction-rating targeting. Converting the three columns to `category_id` would touch every one of those read sites to resolve an id back to a name for no behavioral gain, for a vocabulary that isn't expected to change shape.

## Considered options

- **A — Convert `category`/`employee_category` to `category_id uuid references employee_categories(id)`.** Rejected: every existing join, dropdown, filter (Employees, Office Hour, Category Grace, SMS recipient filters, satisfaction-rating breakdowns) reads/writes the category by name string; a surrogate-id FK would force each of those sites to resolve id↔name for a rename that isn't happening, for a table with at most ~20 rows.
- **B — FK the existing `text` columns straight to `employee_categories.name` (chosen).** Zero changes to any existing read/join/dropdown; the new table's `id` still exists for a future Attendance table that wants to reference a Category as its own foreign key, without forcing the three legacy columns through the same shape.

## Consequences

- Renaming a category later means updating `employee_categories.name` and relying on the FK's default `NO ACTION`/cascade behavior (not yet decided, since no rename need exists today) to propagate — an id-based FK would have made a rename trivial and non-breaking. Accepted because this vocabulary is fixed and code-owned (ADR-adjacent to why it isn't per-school-editable), not something expected to get renamed in place.
- A future table that wants a Category as a real relational column (not just a validated string) should FK to `employee_categories.id`, not repeat this pattern — the name-FK choice here is specifically about not disturbing three already-live text columns, not a general recommendation for new schema.
