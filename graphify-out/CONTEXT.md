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
An external reseller partner assigned one or more Territories, who sells Subscription Codes to Schools within those Territories. In the legacy system, Dealers are records managed entirely by the Super Admin — they have no login of their own. The web rebuild adds genuine Dealer self-service (login, buy code batches) as new functionality, not preserved parity.
_Avoid_: Agent, partner

**Territory**:
A geographic area (built from the legacy 4-level `location` hierarchy: Zone/Division → District → Upozilla → Union) assigned to a Dealer or Government Official, defining which Schools they can sell to / oversee.
_Avoid_: Area, region, zone (unless referring to a specific level in the location hierarchy)

**Super Admin**:
The software vendor's own operator role, with full control of the platform: manages Schools, Dealers, Government Officials, Subscription Codes, and vendor-side accounting. In the legacy system this was a single shared hardcoded secret key (no per-person accounts, no audit trail); the rebuild gives Super Admin real per-person authenticated accounts.
_Avoid_: Vendor Admin (mislabeled earlier in this doc — see Government Official for what `admin_users` actually is)

**Government Official**:
A read-only, Territory-scoped oversight account for a government education office (e.g. UPEO, DEO, DC, Education Secretary), used to monitor every School within their jurisdiction — dashboards and drill-down into attendance/exams/fees/etc., no write access. Corresponds to the legacy `admin_users` table (which is misleadingly named "Admin" in the legacy app — it is not vendor staff).
_Avoid_: Admin, Vendor Admin

**Subscription Code**:
A prepaid code, generated in a batch by the Super Admin (validity period + price) and issued to a School — directly today, and via self-service Dealer purchase in the rebuild — to activate or extend that School's subscription. Same concept as the legacy `activation_code`.
_Avoid_: Activation code (legacy term; keep using it only when referring to the legacy system)

**Permission Grant**:
A Staff User's access is boolean per screen/module (can open it or not) — not per-action (no separate read/write/delete). Matches the legacy `sub_user.paths` behavior (a list of navigation-tree paths the user may open).
_Avoid_: Role, permission level (implies granularity beyond screen-level access)

**Student / Parent** (data subject, not an actor):
Students and their parents have no login in v1 of the rebuild — they are records managed by School Owners/Staff Users, reached only via SMS and public notice/gallery pages. A self-service portal is an explicit fast-follow, not part of this rebuild's scope.
_Avoid_: Student user, parent account (implies a login that doesn't exist in v1)
