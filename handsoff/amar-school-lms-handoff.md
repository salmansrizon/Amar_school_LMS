# Handoff — Amar School LMS MVP build

**Repo:** `/Users/salmansakib/Documents/Projects/Amar_school_LMS` (github.com/salmansrizon/Amar_school_LMS)
**Date:** 2026-07-08. Fresh agent: read this, then `~/.claude/projects/-Users-salmansakib-Documents-Projects-Amar-school-LMS/memory/MEMORY.md`, `CONTEXT.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/adr/`.

## Mission

Implement the 12 `ready-for-agent` GitHub issues as the first MVP of a Next.js 16 + Supabase multi-tenant school platform, in `web/`. 11-PR plan; PRs 1–9 are DONE (merged to `staging`, Greptile-clean). PR 10 is open awaiting re-review; PR 11 is drafted but not started on a branch.

## Non-negotiable workflow (user-mandated)

1. Every PR branches off and merges into **`staging`** — never `main`. The user promotes staging → main themselves after testing.
2. **TDD**: failing test first at pre-agreed seams — (a) pure domain logic via Vitest unit tests, (b) DB/RLS via integration tests against the live Supabase project. UI verified manually on staging. Run tests from `web/` (`npx vitest run`) — running from repo root breaks env loading.
3. After opening/updating a PR: run **greploop** (Greptile CLI, GitHub app NOT installed): `GREPTILE_API_KEY=$(cat ~/.greptile-api-key) npx -y greptile review --branch staging --agent`. Fix findings, push, re-review until 5/5 + no comments, then `gh pr merge N --merge --delete-branch=false`. ("Base branch was modified" → sleep 3 and retry.)
4. Standards: `/typescript-pro` + `/codebase-design` guidance; keep code simple.

## Environment facts

- **Supabase**: project `amar-school-lms`, ref `bwsnjtnxiypehbipdttp` (ap-southeast-1). Apply DDL with the Supabase MCP `apply_migration` AND mirror the SQL into `web/supabase/migrations/NNNN_*.sql` (18 applied so far). Test seed: `web/supabase/seed-test.sql` (owner-a/owner-b/super@test.local, staff-a1, dealer-1, gov-1 — password in that file). `vendor_secrets` table holds the reconcile job secret (value in `web/.env.local` as `RECONCILE_SECRET`).
- **Vercel**: project `amar-school-lms` (`prj_RRT1t1sk2yN52JgVoZDpiKpTSYvy`, team `team_zgs5KUvpCRLgus9YUVZOeaFa`), root dir `web`, GitHub-linked → every push to `staging` auto-deploys. Staging URL: https://amar-school-lms-git-staging-salmansrizons-projects.vercel.app (behind Vercel SSO — user declined/blocked disabling protection; they log in to view). Env vars set in all envs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RECONCILE_SECRET`, `CRON_SECRET` (values in Vercel; do not print).
- **Greptile key**: `~/.greptile-api-key` (chmod 600). Never commit or echo it.
- **No service-role key** available — server-side DB access is anon key + self-gating SECURITY DEFINER RPCs (token/secret args). This is intentional; Greptile flags it every round — rebut with this rationale.
- Next 16 quirks: middleware is **`proxy.ts`** (`proxy` export) — Greptile falsely claims it must be `middleware.ts` every review; the build output `ƒ Proxy (Middleware)` proves it works. Check `web/node_modules/next/dist/docs/` before writing Next code.
- GitHub Pages (main branch) serves `ui/` mockups — visual spec only; do not break `index.html`/`ui/`.

## Current state (exactly)

- Local branch: `feat/10-rfid-attendance`, all work committed & pushed (dc52180). PR #22 open (base staging).
- PR 10 status: first review had 5 findings; all addressed (key fix: reconciliation now consumes only resolved taps — unregistered-card taps replay; migration 0018). 143 tests green, lint/build clean. **Blocked step: the greploop re-review** — a Claude-harness Bash-classifier outage kept rejecting the command; retry `zsh <scratchpad>/run-greptile.sh` or the inline command above. Expect ~5/5; then merge PR #22.
- PR 11 (#12 Absence SMS) NOT started on a branch, but fully drafted in this session's scratchpad `/private/tmp/claude-501/-Users-salmansakib-Documents-Projects-Amar-school-LMS/b3a44983-6a37-44b3-bc7e-24c5d07954ae/scratchpad/`: `pr11-migration.sql` (off_days, student_leaves, absence_sms_rules, sms_log + `absence_sms_candidates` streak SQL — NOTE: reorder so `is_absent_working_day` is created BEFORE `absence_sms_candidates`), `pr11-sms-gateway.ts` (→ `web/lib/sms/gateway.ts`), `pr11-route.ts` (→ `web/app/api/sms/absence/route.ts`; add a second cron entry in `web/vercel.json` at "0 13 * * *", after the 12:30 reconcile), `pr11-test.ts` (→ integration test), `pr11-unit-test.ts` (→ unit test). Branch `feat/11-absence-sms` off staging AFTER PR 10 merges; TDD order: unit red → gateway; integration red → migration 0019; then a small `/school/sms` UI (rule config + log with date-range totals) + i18n keys + school-home link, PR, greploop, merge.
- Issues #1–#12 remain open on purpose — they close when the user merges staging → main.

## Gotchas learned

- `git add -A` from repo root once swept in `node_modules`/`.DS_Store` — root `.gitignore` now exists; still prefer `git add web`.
- Two+ PR branches both appending to `web/lib/i18n.ts` and `web/app/school/page.tsx` links → expect merge conflicts; resolution = keep both blocks (see commit 366dc3f/06ede51 pattern; check the WHOLE conflict list, not `tail -3`).
- Integration tests share seeded rows → `fileParallelism: false` in `web/vitest.config.ts`; keep new tests idempotent with cleanup and fixed historical dates.
- Greptile CLI sometimes 30s-timeouts or the review call runs 10+min — re-run; use `run_in_background` for long calls.
- Subscription-code redemption and closed exams are trigger-immutable — tests must use throwaway rows (see `subscription-codes.test.ts` pattern), super_admin is exempt where noted.

## After PR 11 merges (wrap-up)

1. Full suite green from `web/`; confirm staging deployment READY (Vercel API or dashboard).
2. Tell the user: test each slice on staging (credentials in `seed-test.sql`), then merge staging → main themselves; issues auto-close via the PR "Closes #N" lines only if GitHub matches them on default-branch merge — otherwise close manually with a comment linking the PR.
3. Flag for user judgment: Vercel SSO on staging (they open it logged-in), mimsms credentials (`MIMSMS_API_KEY`/`MIMSMS_SENDER_ID` env to go live with real SMS), Greptile GitHub app install for inline PR reviews.

## Suggested skills

- `/tdd` — the loop rules; seams already agreed (unit + DB integration).
- `/resolving-merge-conflicts` — for the i18n/school-page conflicts between stacked PRs.
- `/typescript-pro`, `/codebase-design` — code standards the user asked for.
- `/verify` — before merging PR 11, drive the absence-SMS flow end-to-end against the live DB.
