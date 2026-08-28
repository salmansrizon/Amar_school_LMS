# ADR 0010 — School↔Distributor ownership is explicit, and reassignment is forward-only

Status: Accepted (map #458, docs/012_super_admin_ui.md)

## Context

`docs/012_super_admin_ui.md` treats "the school's Distributor" as a first-class
property: a column on the School List, a field on Create School, a section of
the School Profile, the grouping for "Distributor → Schools", and the basis for
commission and settlement attribution.

The schema has no such property. The only School↔Distributor link is
`territory_assignments` (assignee → location subtree | cluster | single school),
which is a **reachability** relation used for RLS: it answers "may this
Distributor see this School?", and it is legitimately many-to-one. A School in
Union U (assigned to Distributor A) that also belongs to Cluster C (assigned to
Distributor B) is reachable by both. Reachability cannot answer "who earns the
commission on this School's invoice?".

Deriving ownership from reachability by a precedence rule (most specific
assignment wins) was considered. It needs no schema change, but ownership then
silently changes whenever a territory is edited — and because commission and
settlement reads would resolve through the same rule, a territory edit would
retroactively rewrite financial history. `docs/012_super_admin_ui.md` §29/§30
explicitly forbid conflicting or mutable financial records.

## Decision

**1. Ownership is explicit.** `schools.distributor_id` names the one Distributor
that owns the School commercially. It is set at Create School, changed only by
Super Admin, and backfilled once from the most-specific existing territory
assignment (school > cluster > location).

**2. Ownership and coverage are different concepts.** `territory_assignments`
keeps its current meaning — *coverage*: who may see and sell into an area. It is
unchanged and stays the basis for RLS. `schools.distributor_id` is *ownership*:
who earns on this School. A Distributor may cover a School it does not own.

**3. Reassignment is forward-only.** Moving a School from Distributor A to B
never recomputes anything. Every `commissions` row already accrued keeps its
`distributor_id` (the table already stores it per row), settled or not. Invoices
issued before the move stay attributed to A, and payments landing on them still
accrue to A. B earns from the next invoice onward.

**4. The relationship is historised.** A `school_distributor_history` row
(school, distributor, from, to) is appended on every change, so an old invoice's
"view distributor" link resolves to the Distributor who owned the School *at
that time*. The current owner is duplicated onto `schools.distributor_id`
deliberately: every School List query filters and displays by current owner, and
a column beats a `to is null` join on the hottest read path in the panel.

## Consequences

- Commission attribution is deterministic and immutable: a settlement statement
  printed yesterday still reconciles today.
- The School Profile shows a Distributor *relationship history*, not a single
  current name.
- A School can have no Distributor (`null`) — direct-sold Schools are legal, and
  the UI must render that, not assume a Distributor exists.
- Ownership and coverage can disagree. That is intended, and the Distributor
  Profile must not conflate them: "Schools" means owned; territory means covered.
- Anyone adding a financial read must key off `schools.distributor_id` (or the
  snapshot on the `commissions` row), never off `territory_assignments`.
