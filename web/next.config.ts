import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // ASVS 5.0 V13.4.6 — stop advertising the framework. Staging leaked
  // `x-powered-by: Next.js` (#528).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // ASVS 5.0 V3.4.1 wants >= 1 year AND all subdomains. Staging sent
          // max-age=63072000 with no includeSubDomains, which fails at L2 — and
          // this app is multi-tenant *on* subdomains, so they are the whole point.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // URLs here carry student, exam and invoice ids, so nothing should leave
          // with a referrer.
          { key: 'Referrer-Policy', value: 'same-origin' },
          // ASVS 5.0 V3.4.6 calls this obsolete beside frame-ancestors; kept as a
          // pre-2018 backstop only.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Clickjacking protection ships ENFORCED from day one, on its own,
          // because frame-ancestors does nothing in report-only mode — the strict
          // policy in proxy.ts is report-only for now and would leave the app
          // frameable in the meantime. This directive alone cannot break a render.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // Reports for the report-only policy proxy.ts sets. MDN is explicit that
          // report-to does nothing without this header.
          { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
        ],
      },
    ]
  },
};

export default nextConfig;
