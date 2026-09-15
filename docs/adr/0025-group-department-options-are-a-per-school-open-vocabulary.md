# Group Department options are a per-School open vocabulary, not a generic custom-field mechanism

**Status**: accepted

Group Department (`class_offerings.group_department`) was free text with no structure. Add Class now offers a dropdown of built-in choices (Science, Business Studies (Commerce), Humanities (Arts)) plus an Other option that lets a School type its own (e.g. "Physics"), which must then reappear as a selectable choice on every later Add Class for that School. This needs somewhere to live. The School's other configured-vocabulary columns — `schools.education_levels`, `schools.configured_shifts` — are `text[]` columns CHECK-constrained to a fixed platform list; a School can only pick a subset of a menu the platform defines, never add a value the platform hasn't. Group Department's Other option needs the opposite: a School inventing its own value that the platform has never heard of. Reusing the `text[]` + CHECK shape was rejected outright — a CHECK constraint enumerating an open-ended, per-School-grown list is a contradiction, and every new School-submitted value would require a schema migration to add it to the array's allowed set.

Chosen instead: a new table, `school_group_department_options` (`school_id`, `name`), one row per School-submitted value, unique per School case-insensitively (case preserved on the stored value). The built-in three options stay code constants — they are never written into this table — so the dropdown is always "code constants, divider, then this School's rows from the table."

## Considered options

- **A — Extend the `text[]` + CHECK pattern, letting the CHECK's array grow via migration.** Rejected: every school's first novel Group Department name would need a schema change, which defeats the point of a self-service Other option.
- **B — A single generic `school_custom_options` table keyed by field name (`school_id`, `field`, `value`), reusable for Group Department today and any future extensible field (e.g. Religion, which currently has no persistence at all for its own Other value).** Considered, since the shape is identical. Rejected for now: no second consumer exists yet, and a shared table without a second real caller is speculative generality — it would need its own naming/validation rules per `field` anyway once a second consumer showed up, which is exactly when to generalize it, not before (per the school owner: implement this feature only, no unrelated scope).
- **C — A dedicated `school_group_department_options` table (chosen).** Matches the existing per-School child-table shape already used throughout this schema (RLS via `school_id = app_current_school_id()`, `for all` policy plus a super-admin policy), costs one migration, and is trivial to fold into a shared table later if a second field needs the same pattern — the table's shape (`school_id`, `name`, unique case-insensitively) is already what a generalized version would look like per field.

## Consequences

- Adding this same "built-in constants + per-School open vocabulary" pattern to another field (Religion was raised only as a UX reference, not a target) means either copying this table's shape again or, once there are two, collapsing both into option B's generic table — deferred until that second case is real.
- Historical `class_offerings.group_department` free-text values are untouched: nothing back-fills `school_group_department_options` from existing data, so a School's dropdown starts empty of custom options even if their existing Offerings already used values like "Physics" in free text. A School re-adds it once via Other and it's remembered from then on.
- Case-insensitive dedup means "physics" and "Physics" collide; whichever was submitted first is what every later Add Class sees and offers.
