# Amar School Management — Web Rebuild Architecture

Companion to [`PRD.md`](./PRD.md) and [`CONTEXT.md`](../CONTEXT.md). Decisions here that are hard to reverse are recorded as ADRs in `docs/adr/` — this document explains how they fit together; it doesn't re-litigate them.

## 1. Stack

- **Frontend/Backend**: Next.js (App Router), TypeScript, single deployment.
- **Database**: PostgreSQL via Supabase.
- **Auth**: Supabase Auth (email/password + email OTP for password reset, matching the legacy Gmail-SMTP-OTP flow's UX without hand-rolling it).
- **File storage**: Supabase Storage (replaces legacy MySQL `longblob`/`blob` columns for photos, logos, gallery images, attached receipts/PDFs).
- **Hosting**: Vercel (app) + Supabase (DB/Auth/Storage), both on free tiers for the prototype phase (§8). Anything free tiers can't support (e.g. large-file caching, heavy background compute) falls back to browser-side caching or a free-tier-compatible alternative rather than a paid service, until the prototype graduates.

## 2. Application shape

One Next.js application, one login page, role-based routing/rendering (ADR 0003). Roles: School Owner, Staff User, Dealer, Super Admin, Government Official (see `CONTEXT.md`). Route groups under the App Router split by role (e.g. `/school/*`, `/dealer/*`, `/super-admin/*`, `/gov/*`), each protected by middleware that checks the session's role claim — not by separate apps/deployments.

## 3. Multi-tenancy

Shared database, shared schema, `school_id` column on every School-scoped table, enforced by Postgres Row-Level Security policies plus application-layer checks (ADR 0002). This mirrors the legacy MySQL shape (one DB, every table keyed by a company/user ID) so the data model port is closer to a schema translation than a redesign.

- **Staff User permissions**: legacy `sub_user.paths` (a `::`-delimited list of navigation-tree leaf paths) becomes a `staff_permissions` table: `(staff_user_id, screen_key)`. Screen-level boolean grants only — no CRUD-level granularity, matching legacy behavior exactly (see PRD §5.10).
- **Dealer/Government Official Territory**: legacy `location` (self-referential `child_of` tree, 4 levels: Zone/Division → District → Upozilla → Union) and `dealer_location`/`admin_location` port directly to a `locations` table plus a `territory_assignments` join table (assignee type + assignee id + location id), preserving the recursive "this node and all descendants" query pattern used throughout the legacy app (territory resolution, cluster views, aggregate dashboards).
- **Vendor-side roles are not tenant-scoped**: Super Admin, Dealer, and Government Official rows live outside the `school_id` RLS boundary — they're vendor-business entities that *reference* Schools, not Schools themselves.

## 4. Auth & roles

| Role | Legacy auth | New auth |
|---|---|---|
| School Owner / Staff User | MySQL row + plaintext-ish/legacy hash | Supabase Auth user, `role` + `school_id` claims |
| Dealer | No login existed | Supabase Auth user, `role` + `territory_ids` claims |
| Super Admin | One shared hardcoded secret string | Supabase Auth user(s), `role = super_admin`, individually audited |
| Government Official | Email/password against `admin_users`, SHA-1 hash | Supabase Auth user, `role` + `territory_ids` + `education_levels` claims |

A `profiles` table (keyed to `auth.users.id`) carries role, school/territory scoping, and profile fields not native to Supabase Auth. RLS policies read these claims (via a `security definer` helper or JWT custom claims) to scope every query.

## 5. Hardware & external integrations

- **Attendance machines**: dual-path ingest per ADR 0001 — a per-School webhook endpoint (`/api/attendance/ingest/[schoolId]`) accepts either (a) direct device push (ADMS-style POST) or (b) batched uploads from a local bridge agent for non-push hardware. Both paths write to the same `attendance_events` staging table, processed by the same reconciliation job described in §6.
- **ID cards / RFID assignment**: manual card-number-to-person binding stays a simple form (matches legacy keyboard-wedge-reader UX — no live SDK dependency, same as today).
- **SMS**: a provider-agnostic `SmsGateway` interface with a `MimSmsProvider` default implementation (preserves `esms.mimsms.com` as the live default), so a future provider swap doesn't touch call sites.
- **PDF/printing**: legacy Swing print-preview flows (receipts, mark sheets ×3, progress reports ×3, admit cards, ID cards, routines, attendance books) become server-rendered PDFs (e.g. via a headless-Chromium or React-PDF renderer) served for browser print/download — one shared templating layer, mirroring the legacy `C_TAMPLATES` shared-header/footer component pattern (institute header, exam header, student-info block, grade panel, "powered by" footer as composable template pieces).

## 6. Background jobs

Legacy `C_SUPER_AutoTask` polled a hardcoded production server IP and processed queued RFID events into attendance records. In the rebuild this becomes a proper queued job (e.g. Supabase Edge Function on a schedule, or a Vercel cron route) that:
1. Reads unprocessed rows from `attendance_events`.
2. Resolves student vs. employee, entry vs. exit, per that School's shift/office-time/consider-minutes/punch-mode configuration.
3. Writes/updates the finalized attendance record.

No hardcoded server affinity — any deployment can run the job.

## 7. Data model notes (legacy → new, high level)

- `company` → `schools`; `users` (school owner) → `profiles` with `role = school_owner`; `sub_user` → `profiles` with `role = staff_user` + `staff_permissions`.
- `activation_code` → `subscription_codes` (add a nullable `sold_by_dealer_id` — legacy has no such tracking; this is new, see PRD §8.3).
- `dealer_users`/`dealer_location`, `admin_users`/`admin_location` → `profiles` (`role = dealer` / `role = gov_official`) + `territory_assignments`.
- `location` → `locations` (self-referential, keep the 4-level type enum).
- `cluster` → `clusters`, referenced by `schools.cluster_id`.
- `service_block_panel` (17-item per-School feature flag list) → `school_feature_flags`, kept as ad-hoc booleans for v1 (PRD open question: whether this becomes a real plan/tier system later).
- Per-domain School tables (`students_info`, `teachers_info`, `attendences`, `exams`, `result`, `student_fee_collection`, `a_vouchar_lists`, `gallery`, etc.) port with `school_id` added and BLOB columns replaced by Storage object references.

## 8. Deployment phasing

- **Phase 1 (prototype)**: Vercel free tier + Supabase free tier. Explicitly cost-constrained — anything the free tiers don't cover falls back to a free alternative (browser caching, client-side generation, etc.) rather than introducing a paid dependency.
- **Phase 2 (production, post-prototype)**: revisit hosting tier, background-job execution model, and file-storage costs once real School data volume and traffic are known; not designed in detail here.

## 9. Migration execution

Per PRD §9 (big-bang per-School cutover): a migration script reads one School's rows across the legacy MySQL schema, transforms them per §7's mapping, and writes them into the new Postgres schema inside a transaction, followed by a verification pass (row counts, spot-checks on financial totals) before the School is cut over and the desktop app retired for that School.
