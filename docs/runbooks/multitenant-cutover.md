# Multi-tenant go-live cutover (issue #113)

HITL runbook for wiring the production domain `edumebd.com` to the multi-tenant
subdomain routing (map #104; app-side routing landed in T2 #109 / T3 #110).
Requires Vercel dashboard + registrar access — it is not code, so it lives here
rather than in a migration or script.

## Routing model

| Host | Serves |
| --- | --- |
| `edumebd.com` | apex — generic login (landing page deferred; `/` redirects to `/login`) |
| `edumebd.com/login` | generic login form (no school branding) |
| `{slug}.edumebd.com` | tenant — branded login for the school with that subdomain |
| `{slug}.edumebd.com/login` | branded login (school name + logo) |
| unknown `{slug}.edumebd.com` | "no such school" page (never the app) |

`{slug}` is the school's `subdomain`, assigned by the super-admin at school
creation. Resolution logic: [web/lib/auth/tenant-host.ts](../../web/lib/auth/tenant-host.ts)
+ [web/lib/auth/tenant-routing.ts](../../web/lib/auth/tenant-routing.ts), applied
in [web/proxy.ts](../../web/proxy.ts).

## Cutover steps (Vercel)

1. **Nameservers → Vercel.** Domain delegated to `ns1.vercel-dns.com` /
   `ns2.vercel-dns.com`. (Registrar-side A/CNAME will *not* deliver wildcard SSL;
   NS delegation is required.)
2. **Attach domains to the `amar-school-lms` project → Production:**
   - `edumebd.com` (apex)
   - `*.edumebd.com` (wildcard — this is what routes every tenant subdomain to
     the deployment; without it, subdomains return Vercel `DEPLOYMENT_NOT_FOUND`)
   Vercel auto-issues the wildcard cert (SAN `*.edumebd.com, edumebd.com`).
3. **Env — set and REDEPLOY.** `NEXT_PUBLIC_ROOT_DOMAIN=edumebd.com` for
   **Production**. This is a `NEXT_PUBLIC_*` var, so it is inlined at **build
   time** — a new deployment is mandatory; setting it alone changes nothing.
   Default when unset is `localhost:3000`, which makes every `*.edumebd.com` host
   resolve as *apex* (symptom: unknown slug shows the generic login instead of
   "no such school").
4. **Email (only if the domain sends mail).** Re-add MX/SPF/DKIM in Vercel DNS
   before relying on delegation. `edumebd.com` currently has no MX — skip unless
   that changes.

## Verification

Vercel Attack Challenge Mode (Firewall) serves a 429 "Security Checkpoint" to
non-browser clients, so `curl` can't see past it — verify in a real browser.

- `https://<unknown-slug>.edumebd.com/login` → **"স্কুল খুঁজে পাওয়া যায়নি" / "no such
  school"**. Proves `NEXT_PUBLIC_ROOT_DOMAIN` is live and tenant routing runs.
- `https://<real-slug>.edumebd.com/login` → **branded login** (school name + logo).
  Proves `school_by_subdomain` + `brandForHost` resolve a real tenant.
- Both over valid SSL (wildcard cert).

## Gotchas

- **Redeploy after any `NEXT_PUBLIC_ROOT_DOMAIN` change** — build-time inlined.
- **`DEPLOYMENT_NOT_FOUND` on a subdomain** = `*.edumebd.com` not attached to the
  project (distinct from the wildcard *cert*, which can exist independently).
- **Generic login on a real slug** = env var missing/not redeployed (host falls
  back to apex).
- **CAA `0 issue "pki.goog"`** on the zone restricts cert issuance; harmless once
  the wildcard cert is issued, but watch it if a future renewal fails.
- **Attack Challenge Mode** blocks API/health checks — disable in Firewall if you
  need non-browser access to tenant hosts.
