# 013 — School Owner UI/UX overhaul (local map)

Adopt `Design System/new_ui` (13 screens, desktop + mobile) across the School Owner portal. One design language, fewer page hops, quick actions on every page.

Branch `feat/owner-ui-overhaul` (off `staging`). Local map — no GitHub issues. All phases built and tested locally, then **one PR to staging**.

Research: `docs/research/2026-09-26-owner-ui-ux-patterns.md`.

## Decisions log

- Q27: reference wins over #370 kit where they conflict — status pills, two-line rows with avatar, normal-case headers.
- F3: drawer opens via `<Link>` (server render), not `pushState`; revisit in S2 if over budget.
- Reference comparison: jev checks **structure/content** (claims from reference screen vs Playwright snapshot); I check **visuals** side by side. Gaps → user.
- Student ID shown = Student Number. No English name (no column). Class filter stays one Class Offering picker.
- Fee column = **Monthly Fee Standing** (Paid / Partial / Due, current month) — see CONTEXT.md. Attendance = **Attendance Rate**, year to date, bands ≥90 / 75–89 / <75.
- No-DB features added: bulk ID card print (reuse single print), CSV export (filtered list), "Remind" → SMS Center with guardians prefilled.

## Rules

- **UI only.** No schema change. Derived values (attendance %, fee status, counts) computed in server components, whole-school, per-request cache, then filter/paginate.
- **Migration exception:** only for a page measured over budget (student directory > 800 ms server time). Additive only (index / new view / new function); never replace an existing object. New views state `security_invoker = off, security_barrier = true` and `revoke ... from public`. SQL + jev impact report written, **user applies**.
- Build on existing: `components/ui/page.tsx`, `components/ui/table.tsx`, `@base-ui/react`. No new UI library.
- Every label through `t()`, Bangla default. Tokens only, no raw hex (dark mode).
- Quick actions and nav gated by `canOpenScreen` (`lib/auth/screens.ts`).
- Record lists → `DataTable`. Grids (marks entry, attendance book, routine, office hours) keep layout, take shared table styling.
- Local test writes only on **Test School A** (`owner-a@test.local`). Demo school read-only. Local dev hits the shared DB.

## Done-check (every ticket)

1. `npm run typecheck`, `npm test` green.
2. Playwright text snapshot, desktop 1440 + mobile 390, on localhost.
3. `jev_verify`: ticket's claims vs diff + snapshot. Any `review` / `contradicted` → user.

## Phase 0 — Foundation

- [x] **F1** Token audit: reference vs `app/globals.css`; add only missing tokens. → none missing.
- [x] **F2** `DataTable`: column defs, search, filter selects, quick-filter chips, server pagination, selection + bulk bar, row Profile + ⋮ menu, empty/loading/error, card render below breakpoint.
- [x] **F3** `RecordDrawer`: base-ui `Drawer` (fallback `Dialog`), right side, `?view=<id>` via `window.history.pushState` (open = push, close = `history.back()`, record-to-record = replace); server reads `searchParams.view` so refresh opens it; focus title on open, return to row; "Open full page" link to `[id]`.
- [ ] **F4** `PageHeader` (breadcrumbs, title, count badge, secondary + primary actions, More ⋮), `StatCard` (value + action link), `AlertStrip`, `QuickActions` (grant-gated); Pager: showing X–Y of N, per-page 10/20/50, numbered pages.
- [ ] **F5** Top bar: year/shift switcher (per-user cookie, `lib/ui-prefs-server.ts`), SMS credit chip (`sms_balance`), reuse ⌘K search; phone bottom tab bar (5 sections), hamburger kept.
- [ ] **F6** Shortcuts hook: `/` search, `F` filters, `Esc` drawer — never while typing, IME composing (`isComposing`), or with modifiers; match `event.key`. On/off toggle in ui-prefs cookie, default on (WCAG 2.1.4).
- [ ] **F7** Derived-metric helpers: Attendance Rate (YTD, banded), Monthly Fee Standing (reuse `lib/dashboard.ts` `attendanceRate`, `lib/fees.ts` `dueAmount`), per-request cache, unit tests.

## Phase 1 — Overview

- [ ] **O1** Owner dashboard: alert strip, 4 stat cards, quick actions, daily checklist, upcoming events (`buildUpcoming`), module nav.

## Phase 2 — People

- [~] **P1** Student directory → `DataTable` + drawer (`ProfileEditor` shared with `[id]`). Left: Attendance Rate + Monthly Fee Standing columns/filters/chips (F7), search by Student Number + guardian mobile, Student Number line, header (ID card bulk print, export, More ⋮ with class logins), row ID-card + Remind actions, stat cards.
- [ ] **P2** Student admission form restyle.
- [ ] **P3** Employee directory → `DataTable` + drawer.

## Phase 3 — Academics

- [ ] **A1** Classes & curriculum.
- [ ] **A2** Attendance (grid styling).
- [ ] **A3** Exams & results.

## Phase 4 — Finance & Communication

- [ ] **FC1** Fees & finance.
- [ ] **FC2** SMS center.
- [ ] **FC3** Notices.
- [ ] **FC4** Messages & requests.

## Phase 5 — Administration

- [ ] **AD1** Institution settings.
- [ ] **AD2** Staff permissions.

## Phase 6 — Sweep + ship

- [ ] **S1** Remaining record lists (activity, approvals, corrections, feedback, questions, subscription, staff, archive) → `DataTable` + drawer.
- [ ] **S2** Measure server time per page; migration only where over budget (rules above).
- [ ] **S3** Full local pass: typecheck, unit, integration, E2E; jev audit across all tickets.
- [ ] **S4** One PR → `staging`; user reviews.
