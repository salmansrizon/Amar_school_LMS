---
status: accepted
supersedes: the Policy Engine clause of ADR-0008
---

# One registry decides what gates a screen, and an unregistered screen is denied

Four mechanisms answered "may this caller open this": a declared `PolicyEngine` interface, `canOpenScreen`, ~200 RLS policies, and a set of SECURITY DEFINER helpers. Only three of them existed. **The registry in `lib/auth/screens.ts` is now the one place that says what gates a screen, and the aspirational engine is retired.**

## The engine is retired, not built

`PolicyEngine` and `AuthContext` (`lib/engines/policy/index.ts`) declared a central pipeline — auth → tenant → role → policy → feature → subscription. Neither was ever implemented or constructed: grep across `app`, `lib`, `components` and `tests` found zero references outside the file declaring them. The shipped `authorize()` did not implement the declared interface and never claimed the pipeline's stages; `canOpenScreen`, which `CONTEXT.md` documents as the **Permission Grant**, never called it. The interesting decisions — which Student, which Class, which message — reached none of it.

`/codebase-design`'s bar is that one adapter means a hypothetical seam and two mean a real one. This had none, so it is deleted rather than adapted: `PolicyEngine`, `AuthContext`, `AppRole`, and `pbac.ts`.

`pbac.ts` is the deletion worth defending. `authorizeContext()` **did** combine role, tenant and feature through the `app_authorize` RPC — the pipeline, half-built — and had zero app call sites, only a passing integration test. Kept, it would have been a second answer to the same question that nothing asks. The SQL half survives: migrations here are additive, `app_authorize` is still in the database and still correct, so rebuilding this is one file if a caller ever appears.

`authorize()` stays. Six vendor-vs-tenant permission keys, three call sites in `require-role.ts`, honest about being one RPC call.

## An unregistered screen is denied

`proxy.ts` gates on the first path segment. `screenKeyForPath` returned `null` for any segment it did not know, and `proxy.ts` read `null` as **ungated** — so a typo in a nav href did not break a link, it silently widened access. Eight segments were reachable that way, three of them named in #513.

Every screen is now a registry row carrying a gate:

| gate | decided by |
| --- | --- |
| `grant` | the Permission Grant — `staff_permissions`, and the ten keys the feature engine switches per school |
| `owner` | School Owner only, never grantable |
| `member` | any authenticated school member; the contents gate themselves through RLS |

`member` is the third answer the proxy did not have, and it is the honest description of `/school/questions` and `/school/corrections`: they ride **no** grant by design (#509 — `feedback` is both a screen key and a feature key, so riding it would take student questions down whenever a school switched guardian feedback off), and their rows are scoped by class attachment in the database (0152, ADR 0018). An office clerk who types the URL gets the section with nothing in it and the empty-scope line explaining why.

**A segment with no row is refused**, for every role. A route added without registering it is unreachable in production rather than silently open. That is the trade: the failure mode of a typo must be less access, not more.

## Consequences

- **`FEATURE_KEYS` is derived, not copied.** A per-school feature switch only makes sense over a screen the Owner can grant, so the grantable set *is* the feature set. The `lib/engines/feature/catalog.ts` array is deleted.
- **Labels live in i18n only.** `GRANTABLE_SCREENS` carried its own bn/en strings, read by exactly one screen. Registry rows carry a `MessageKey` instead, so the grant checkboxes and the sidebar name a screen the same way. One wording moved: the `sms` grant now reads "SMS Settings" / "এসএমএস সেটিংস", matching the screen it grants.
- **0081's seed keeps the labels the Super Admin edits.** Code cannot be derived from it — edge middleware will not query Postgres to learn what routes exist — so the two copies stay and an integration test pins the feature keys to the registry.
- **The `dashboard` sentinel is gone.** It was `ScreenKey | 'dashboard'` written independently in two files, smuggled into the *screen* field because that field conflated which screen renders and what gates it. It is a `member` row now.
- **Gating stays per-segment.** `/school/questions/response` is Owner-only inside the page, not in the proxy. Per-route gating would need a class-teacher lookup in edge middleware, rejected on cost in #509 and not revisited here.
- **AGENTS.md still lists `policy` among the engines.** Correct: `lib/engines/policy/` still holds `authorize.ts` and the permission catalog. What it no longer holds is a promise.
