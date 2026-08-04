# Amar School — Multi-Tenant School LMS

A multi-tenant school management platform for Bangladeshi institutions, plus a
vendor/licensing **Super Admin** panel. Each school runs on its own subdomain
with branded login; a central super-admin provisions schools, manages
subscriptions, territories, government officials, and broadcast SMS.

Bangla-first, bilingual (bn/en) throughout.

## Tech stack

- **Next.js 16 (App Router)** — server components, server actions. This is a
  breaking-change Next version; read `web/node_modules/next/dist/docs/` before
  writing framework code (see `web/AGENTS.md`).
- **Supabase** (Postgres + Auth + Storage) — Row-Level Security is the
  authority; application-layer guards give clean errors.
- **Tailwind CSS v4** (ADR 0006 rewrite).
- **Vitest** — pure logic in `tests/unit`, live-DB suites in `tests/integration`.
- **Vercel** — hosting + cron jobs (`web/vercel.json`).

Everything lives under `web/`.

## Roles, route groups & test credentials

One app, role-based routing (ADR 0003). After login, `postLoginDestination`
sends each role to its home group; `proxy.ts` + RLS enforce access.

| Role | Home group | Purpose | Demo login |
| --- | --- | --- | --- |
| `super_admin` | `/super-admin` | Vendor panel: schools, subscriptions, distributors, agents, gov officials, territories, workflows, notifications, SMS commerce, invoices, settlements, accounting, audit, off-days | `demo.super@amarschool.test` / `DemoSuper#2026` |
| `school_owner` | `/school` | Full school management (all modules) | `demo.owner@amarschool.test` / `DemoOwner#2026` |
| `staff_user` | `/school` | School management, limited to granted screens | `demo.staff@amarschool.test` / `DemoStaff#2026` |
| `distributor` | `/distributor` | Subscription-code sales, assigned territory, CRM pipeline, onboarding, wallet (renamed from `dealer`, #271) | `demo.distributor@amarschool.test` / `DemoDist#2026` |
| `agent` | `/agent` | Field agent under a distributor: assigned tasks (dashboard, task list, mark-done) | `demo.agent@amarschool.test` / `DemoAgent#2026` |
| `gov_official` | `/gov` | Read oversight scoped to designation + territory | created by super-admin (no seeded demo) |

Demo logins are seeded by migrations (`0054` school owner/staff, `0066`
super-admin, `0110` distributor/agent + partner/financial/workflow sample data)
and are throwaway demo accounts — change freely. An owner with no
profile yet claims a pre-created school at `/claim` with a super-admin activation
code.

## Project structure

```
web/
├── app/                      # App Router routes
│   ├── login/  claim/  reset-password/  auth/   # auth + owner onboarding
│   ├── account-blocked/  no-such-school/         # gate / branded 404
│   ├── school/               # /school/* — owner + staff app
│   │   ├── layout.tsx        # SchoolShell + subscription gate/banner (#169)
│   │   ├── students/ attendance/ exams/ classes/ fees/ employees/
│   │   ├── institute/ notices/ feedback/ sms/ activity/ subscription/
│   ├── super-admin/          # /super-admin/* — vendor panel
│   │   ├── layout.tsx        # SuperAdminShell (sidebar + topbar)
│   │   ├── page.tsx          # KPI dashboard
│   │   ├── schools/[id]/     # school detail: block/delete/activation/expiry/flags
│   │   ├── codes/ partners/ agents/ gov-officials/ locations/ clusters/ sms/ off-days/
│   │   ├── workflows/ notifications/ sms-commerce/ invoices/ settlements/ accounting/
│   │   ├── audit-log/ role-permissions/ module-config/ subscription-config/ coupons/
│   ├── distributor/  agent/  gov/   # distributor (CRM/wallet), agent (tasks), gov landings
│   └── api/                  # route handlers + Vercel crons
│       ├── sms/absence/          # daily absence SMS
│       └── subscription/expiry-sweep/  # daily 7-day expiry reminder (#163)
├── components/               # shells, cards, primitives, print pieces
├── lib/                      # domain logic (pure where possible → unit-tested)
│   ├── auth/                 # routing, require-role, post-login, tenant-host
│   ├── school/  super-admin/ # per-domain seams (context, dashboard, ...)
│   ├── sms/  cron/  subscription.ts  i18n.ts  locations.ts  ...
│   ├── supabase/             # server + client clients
│   └── ...
├── supabase/migrations/      # 76 SQL migrations (RLS-first)
├── tests/{unit,integration}/
├── proxy.ts                  # edge auth gate + subdomain→tenant routing
└── vercel.json               # region + cron schedules
```

## Project map

```mermaid
graph TD
  subgraph Auth
    Login[/login/] --> PostLogin{role?}
    Claim[/claim/] -->|redeem code| Owner
  end
  PostLogin -->|super_admin| SA
  PostLogin -->|owner/staff| SchoolApp
  PostLogin -->|distributor| Distributor[/distributor/]
  PostLogin -->|agent| Agent[/agent/]
  PostLogin -->|gov_official| Gov[/gov/]

  subgraph SA[Super Admin panel]
    Dash[KPI dashboard]
    Schools[Schools + detail\nblock/delete/activation/expiry/flags]
    Codes[Subscription codes]
    Dealers[Distributors + Agents]
    GovOff[Gov officials\ndesignation + edu-scope + territory]
    Terr[Territory + Locations]
    Clusters[Clusters]
    SMS[Broadcast SMS by area]
    Off[Central off-days]
  end

  subgraph SchoolApp["/school (owner + staff)"]
    Owner[Dashboard]
    Students & Attendance & Exams & Fees & Employees
    Institute & Notices & Feedback & SchoolSMS[SMS]
    Gate{{subscription gate + 7-day banner}}
  end

  Schools -.provisions.-> SchoolApp
  Off -.import.-> Attendance
  Cron[[Vercel cron: expiry sweep]] -.7-day reminder.-> Owner
```

## Page flow (auth + tenancy)

```mermaid
sequenceDiagram
  participant U as User
  participant P as proxy.ts (edge)
  participant Pg as Page + RLS
  U->>P: request (host + path)
  P->>P: resolve subdomain → tenant school
  alt unknown subdomain
    P-->>U: /no-such-school
  else deactivated school (owner/staff)
    P-->>U: /account-blocked
  else wrong role group
    P-->>U: homeFor(role)
  else ok
    P->>Pg: forward
    Pg->>Pg: re-verify session + subscription status
    alt subscription expired
      Pg-->>U: "Update subscription" gate
    else within 7 days
      Pg-->>U: page + reminder banner
    else
      Pg-->>U: page
    end
  end
```

## Local development

```bash
cd web
npm install
cp .env.example .env.local     # fill Supabase URL + anon key, CRON_SECRET, RECONCILE_SECRET
npm run dev                    # http://localhost:3000
npm run lint
npx vitest run tests/unit      # pure logic (no DB)
npx vitest run                 # full suite (integration needs a live Supabase)
```

Migrations live in `web/supabase/migrations/` (applied to the shared Supabase
project). Subdomain routing keys off `NEXT_PUBLIC_ROOT_DOMAIN` (`localhost` in
dev).

## Conventions

- **RLS is the authority.** Server actions add `requireSuperAdmin` /
  `requireSchoolMember`-style guards for clean errors, never as the only gate.
- **Deep seams.** Domain logic is extracted into pure, unit-tested modules under
  `lib/*` (e.g. `lib/super-admin/dashboard`, `lib/subscription`); routes stay thin.
- **Shared auth context.** `getSchoolContext` / `getSuperAdminContext` are
  `cache()`-wrapped so a layout and its pages share one auth lookup.
- Wayfinder maps drive feature work; see `web/AGENTS.md` for the build loop.
