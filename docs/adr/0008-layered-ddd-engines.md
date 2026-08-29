# ADR 0008 — Layered DDD + reusable platform engines

Status: Accepted (map #258, ticket #259)

## Context

`docs/master_prd.md` and `docs/006`–`008` mandate that Amar School ERP evolve from a flat, per-feature codebase into a **configuration-driven, event-driven, layered platform** built on reusable engines (Policy, Feature, Workflow, Event, Audit, Notification, Financial) rather than logic duplicated across features.

Today `web/` keeps business logic in flat `lib/*.ts` modules plus route handlers and server components. This works but has no shared authorization pipeline, no event bus, no generic workflow/approval, no centralized financial or audit layer. Map #258 restructures onto the PRD's engine model **without changing existing feature behavior**.

This ADR fixes the structure and conventions every later #258 ticket (#260–#270) builds on. It does not implement any engine.

## Decision

### 1. Layered architecture

Every capability is expressed through these layers (PRD `docs/008`):

- **Presentation** — Next `app/` components/pages. User interaction only, no business logic.
- **API** — route handlers under `app/api/*` and server actions. Thin: validate, authenticate, delegate. No business rules.
- **Application** — orchestration services that coordinate a use case across domain services + engines.
- **Domain** — business logic + entities for one bounded context. Framework-free, no direct DB.
- **Infrastructure** — adapters to Supabase, storage, SMS/email providers, external APIs.
- **Persistence** — repositories owning data access for a domain; the only layer that talks to the DB client.

### 2. Directory layout

- Domain modules: `web/modules/<domain>/{domain,application,infrastructure}` (e.g. `modules/fees`, `modules/exam`). A module owns one business domain and exposes application services; it never touches another module's tables or internals directly.
- Reusable engines: `web/lib/engines/<engine>/` — cross-cutting platform infrastructure consumed by any module (`events`, `audit`, `policy`, `feature`, `workflow`, `notification`, `financial`).
- Existing `web/lib/*.ts` stays in place and is migrated into this structure **incrementally** — a domain moves only when its owning #258 phase touches it. No big-bang move.

### 3. Engine seams

Ticket #259 lands typed **interfaces only** for the seven engines in `web/lib/engines/*/index.ts`. The engine seams are implemented across tickets #260–#267; the remaining #258 tickets (#268–#270) are commerce/partner builds that consume them. Later phases implement:

| Engine | Ticket | Backing |
|---|---|---|
| Event | #260 | Postgres outbox + sync dispatch + Vercel cron |
| Audit | #261 | immutable `audit_log`, event-driven |
| Policy | #262 | `authorize(ctx)` RBAC+PBAC pipeline |
| Feature | #263 | module/feature catalog + plan bindings |
| Workflow | #264 | configurable approval definitions |
| Financial | #266 | wallets + double-entry GL + invoices + commission |
| Notification | #267 | event-driven multi-channel |

Modules communicate through **domain events** (Event engine) rather than direct cross-module calls wherever practical.

### 4. Configuration over code

No business rule (pricing, commission %, permission, feature availability, workflow, notification routing) is hardcoded. All live in DB config tables managed by Super Admin. Code reads config; it does not embed it.

### 5. Refactor guardrail — characterization first

Any refactor that moves existing logic into the new structure must be **behavior-preserving**. Before moving code, the current behavior must be pinned by tests (the repo already has 96 Vitest files under `web/tests/`; `tests/unit/grading.test.ts` is the reference pattern for pure domain logic, `tests/integration/*` for DB-backed flows). A refactor PR that changes any pinned assertion is rejected — behavior changes are separate, explicit tickets.

### 6. Migrations

Additive and backward-compatible by default (`docs/008`). `main` is pre-launch, so a phase may retire/reshape a table where its ticket explicitly says so; every such case is called out in the ticket. DDL goes through Supabase MCP `apply_migration` **and** is mirrored into `web/supabase/migrations/`.

## Consequences

- New work has one obvious home; cross-cutting concerns stop being re-implemented per feature.
- Engines are testable in isolation and reusable by every future module.
- Migration is gradual — the app keeps shipping on staging between phases; no frozen big-bang rewrite.
- Cost: an indirection layer over today's flat modules, justified by the PRD's multi-engine end state.

> **Amended by ADR 0020** (#514): the Policy Engine listed here was a declared interface with no implementation and no adapters. It is retired. Authorization inside a school is RLS plus the screen registry; `authorize()` remains for vendor-vs-tenant permissions. The other six engines are unaffected.
