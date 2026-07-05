# Amar School Management (Web Rebuild)

A multi-tenant school management platform, distributed through a reseller network, being rebuilt from a legacy Java Swing desktop app + MySQL into a modern web application. Covers both the school-facing product and the vendor/dealer business that sells and licenses it.

## Language

**School**:
One educational institution using the platform — a tenant. Corresponds to a row in the legacy `company` table.
_Avoid_: Company, client, tenant (in user-facing text — "tenant" is fine in architecture docs)

**School Owner**:
The primary account for a School; full access to all of that School's modules and data. Corresponds to the legacy `users` row linked to a `company`.
_Avoid_: Admin (ambiguous with Vendor Admin), principal

**Staff User**:
A restricted-permission login belonging to a School, created by the School Owner for an employee, scoped to specific modules/pages. Corresponds to the legacy `sub_user` table.
_Avoid_: Sub-user, employee login

**Dealer**:
An external reseller partner assigned one or more Territories, who sells Subscription Codes to Schools within those Territories. Each Territory assignment carries its own tier (Division/Zilla/Upazila/Union Dealer) — tier is a property of the *assignment*, not the Dealer as a whole, since one Dealer can hold assignments at different levels simultaneously. Tier is descriptive/organizational only (labeling, filtering) — it does not drive pricing, commission, or code-purchase permissions; territory-scoping alone controls what a Dealer can sell into. In the legacy system, Dealers are records managed entirely by the Super Admin — they have no login of their own. The web rebuild adds genuine Dealer self-service (login, buy code batches) as new functionality, not preserved parity.
_Avoid_: Agent, partner

**Territory**:
A geographic area (built from the legacy 4-level `location` hierarchy: Zone/Division → District → Upozilla → Union) assigned to a Dealer or Government Official, defining which Schools they can sell to / oversee. A Dealer or Government Official can hold **multiple** Territory assignments at once (e.g. two separate Unions) — assignment is a list, not a single field. "Extended School access" (an individual out-of-territory School grant) is not a separate mechanism: it's the same kind of assignment, just pointing at one School instead of a location node — but it must be visually flagged as such wherever that School appears in the assignee's Schools list (e.g. an "Extended access" badge), so it's never indistinguishable from a normal in-territory School.
_Avoid_: Area, region, zone (unless referring to a specific level in the location hierarchy)

**Super Admin**:
The software vendor's own operator role, with full control of the platform: manages Schools, Dealers, Government Officials, Subscription Codes, and vendor-side accounting. In the legacy system this was a single shared hardcoded secret key (no per-person accounts, no audit trail); the rebuild gives Super Admin real per-person authenticated accounts.
_Avoid_: Vendor Admin (mislabeled earlier in this doc — see Government Official for what `admin_users` actually is)

**Government Official**:
A read-only, Territory-scoped oversight account for a government education office (e.g. UPEO, DEO, DC, Education Secretary), used to monitor every School within their jurisdiction — dashboards and drill-down into attendance/exams/fees/etc., no write access. Corresponds to the legacy `admin_users` table (which is misleadingly named "Admin" in the legacy app — it is not vendor staff).
_Avoid_: Admin, Vendor Admin

**Subscription Code**:
A prepaid code, generated in a batch by the Super Admin (validity period + price) and issued to a School — directly today, and via self-service Dealer purchase in the rebuild — to activate or extend that School's subscription. Same concept as the legacy `activation_code`. A code's price may be 0 (free/promotional), but it is still a real code: redeeming it counts as "code history" like any paid code (see Trial). Redemption stacks the code's validity onto `max(today, current expiry)` — a still-active School's redemption extends its existing expiry, but a lapsed/expired School's redemption starts fresh from the redemption date rather than compounding onto a stale past-expiry date.
_Avoid_: Activation code (legacy term; keep using it only when referring to the legacy system)

**Trial**:
The status of a School that has never redeemed any Subscription Code (paid or free) — defined purely by the absence of code history, not by time elapsed since signup. A trial School gets full feature access by default, though per-tenant feature flags can independently restrict this. Redeeming any code, including a price-0 promotional one, ends Trial status permanently for that School.
_Avoid_: Free tier, demo mode (imply something time-boxed or feature-limited, which Trial is not by default)

**Fee Collection Record**:
The single record of a Student's fee status for one month, holding cumulative `pay_amount`/`fine_amount`/`adjust_amount`/`due_amount`. Exactly one exists per Student per month (preserve legacy exactly) — a second payment toward the same month **edits this same record's totals in place**, it does not append a new payment-history line. There is intentionally no per-payment-event audit trail underneath it; only the current cumulative totals are retained. Corresponds to the legacy `student_fee_collection` table.
_Avoid_: Payment, transaction (implies an individual event/line item, which this is not — it's a cumulative monthly total)

**Behaviour Log Entry**:
An incident note + numeric rating + remind date recorded against a Student. Becomes read-only 3 days after it was **created** (not 3 days after the incident date it describes, which is free-text and not a trustworthy anchor) — preserves the legacy rule against retroactively rewriting a Student's recorded history.
_Avoid_: Incident report (implies something more formal/investigative than this lightweight rating+note record)

**Considerable Grace Window**:
The number of grace minutes an Employee's attendance check-in/out is allowed to fall outside their configured office-time before being marked late/early. Configurable at multiple levels (global default, category, shift, per-individual override); when more than one applicable value exists for a given check (e.g. an Employee assigned to multiple shifts), the **effective grace is the max across all applicable configured values** for that check — never the stricter/smaller one.
_Avoid_: Buffer, tolerance (use "grace" consistently, matching legacy "considerable" terminology)

**Exam Closed state**:
A one-way, permanent state transition on an Exam — once Closed, marks/setup/routine/seat-plan/subjects become uneditable forever (verified against legacy: no reopen/undo path exists anywhere). Only aggregate result viewing remains available. Preserve as genuinely irreversible, not "irreversible in the UI but recoverable via support" — matches confirmed legacy behavior exactly. Closing is gated by ordinary Exam-screen Permission Grant access only, same as legacy — deliberately not a special elevated action, consistent with Permission Grant being screen-level-only with no per-action exceptions.
_Avoid_: Locked, archived (imply reversibility that doesn't exist here)

**Attendance Event**:
A single raw RFID/biometric card-tap record ingested via the dual-path pipeline (device push or bridge agent — see ADR 0001), staged before reconciliation. Multiple Attendance Events for the same person on the same day collapse to one finalized attendance record: the **earliest tap is entry, the latest tap is exit**; any taps in between are discarded as noise (e.g. a forgotten lunch tap-out/back-in). One finalized record per person per day, not one per in/out pair.
_Avoid_: Punch, tap (fine informally, but the record type is "Attendance Event")

**Absence SMS Rule**:
A School-configured trigger ("exactly N working-days absent" or "absent within an X–Y working-day range") that automatically sends an SMS about a Student. Uses the same "working days" definition as the absent-fine formula (§5.6: total days minus off-days, approved leave, and present days) — one definition, not redefined per feature. Evaluated by a once-daily scheduled job after that day's attendance is finalized, not triggered instantly on each attendance mark.
_Avoid_: Alert (implies real-time urgency this rule doesn't have)

**Permission Grant**:
A Staff User's access is boolean per screen/module (can open it or not) — not per-action (no separate read/write/delete). Matches the legacy `sub_user.paths` behavior (a list of navigation-tree paths the user may open).
_Avoid_: Role, permission level (implies granularity beyond screen-level access)

**Student / Parent** (data subject, not an actor):
Students and their parents have no login in v1 of the rebuild — they are records managed by School Owners/Staff Users, reached only via SMS and public notice/gallery pages. A self-service portal is an explicit fast-follow, not part of this rebuild's scope.
_Avoid_: Student user, parent account (implies a login that doesn't exist in v1)
