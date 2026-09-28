# Office Time is retired as a live attendance input, not replaced

**Status**: accepted

Office Time (`office_times`/`employee_office_times`) had two independent jobs: a candidate in the Considerable Grace Window's MAX calculation, and — separately — the *only* source of an Employee's expected `starts_at`/`ends_at` window for `resolveEmployeeDisplayStatus`/`reconcile_attendance`'s late/on-time/early-exit determination. Its admin UI (creating an Office Time, assigning an Employee to one, and the individual grace override alongside it) is removed as clutter the School Owner explicitly flagged (map #671); every existing assignment and override is cleared in the same migration, not merely hidden.

Removing the assignment mechanism without replacing its second job means `officeStart`/`officeEnd` are now always null for every Employee, so `resolveEmployeeDisplayStatus` (and its SQL mirror `reconcile_attendance`) report every Employee `'present'` whenever a record exists — never late, on-time, or early-exit again. Grilled explicitly against wiring Office Hour (`category_office_hours`, ADR 0026/0029) in as the replacement expected-window source: rejected for *this* change, because Office Hour was built and has only ever behaved as a published/display schedule with zero code path into reconciliation — turning it into a live attendance input is a real, separate feature (new SQL joins in `reconcile_attendance`, a Shift-and-Day resolution step reconciliation doesn't currently do, and its own edge cases for a School with no configured Shifts) that deserves its own grilling and its own issue, not a side effect of a grace-time cleanup ticket.

RFID — the only mechanism that ever populates real `entry_at`/`exit_at` for an Employee — is already disabled School-wide, so this decision changes no currently-observable behavior for any School today. It only forecloses the *current* path back to working late-detection: if RFID is ever re-enabled before a replacement expected-window source exists, every Employee will silently read `'present'` regardless of actual entry time.

## Considered options

- **A — Keep Office Time's assignment (start/end) intact, remove only the individual grace override.** Preserves late-detection for whenever RFID returns. Rejected for this ticket: the School Owner's ask was to remove the per-employee mechanism itself, not just the override number sitting on top of it, and a half-kept feature (still assignable, but presented nowhere near where grace now lives) is its own confusion.
- **B — Retire Office Time's UI and data entirely, accept late-detection goes dark (chosen).** Matches the ask exactly; the DB tables aren't dropped, so a future ticket can still query `office_times`/`reconcile_attendance`'s existing SQL shape if it ever needs to.
- **C — Retire Office Time and wire Office Hour in as its replacement in the same ticket.** Rejected here as scope creep — a genuinely new integration (Office Hour has never fed reconciliation), not a cleanup; tracked as a possible future ticket, not started.

## Consequences

- Any School that starts using RFID again before a replacement lands gets zero late/on-time signal for Employees — every record reads `'present'`. This is a known, accepted gap, not an oversight; a future ticket reconnecting Office Hour (or reintroducing a per-employee/per-category expected window) to `reconcile_attendance` is the way out of it.
- `office_times`/`employee_office_times` remain valid, queryable tables with no admin UI writing to them — a future implementer finding them empty should read this ADR before assuming they're dead weight safe to drop; `reconcile_attendance`'s SQL still joins them by name.
