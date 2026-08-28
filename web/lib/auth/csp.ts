// Content-Security-Policy for the App Router (#528, from the #543 research).
//
// Two things here are not stylistic and will break the app if changed casually;
// both are called out at the directive that carries them.

/** Supabase lives on one origin over two schemes: HTTPS for auth/PostgREST/Storage,
 *  WSS for Realtime. Derived rather than hardcoded so local, preview, staging and
 *  production all work from the same code. */
const supabaseOrigin = () => new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin

/** Whether to enforce the policy or only report it.
 *
 *  One env var chooses the header name, so a wrong policy is rolled back with a
 *  Vercel env edit rather than a revert and redeploy. Report-only is the default:
 *  a CSP that has never met real traffic should not be the thing that decides
 *  whether a school can take attendance. */
export function cspHeaderName(): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
  return process.env.CSP_MODE === 'enforce'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only'
}

/** sonner injects its stylesheet as an inline <style> element (#528). */
const SONNER_STYLE_HASHES = [
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", // the empty sheet it inserts first
  "'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='", // sonner 2.0.8's own CSS
]

export function cspFor(nonce: string): string {
  const origin = supabaseOrigin()
  const ws = origin.replace(/^http/, 'ws')
  const isDev = process.env.NODE_ENV === 'development'

  return [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonced bootstrap script load the code-split chunks
    // it pulls in, without allowlisting every chunk URL.
    // 'unsafe-eval' is dev-only — React uses eval to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // The nonce covers Next's inline <style> blocks (critical CSS, next/font metrics).
    // The two hashes are sonner's: it appends its stylesheet as a <style> element
    // at import time (`document.createElement("style")`), which no nonce can reach
    // because the library never sees ours — sonner 2.0.8 has no nonce option at
    // all. The first hash is the empty string, which it inserts before the real
    // sheet; that one is stable forever. The second is the sheet itself and will
    // change when sonner's CSS does. Verified under `next start` with
    // CSP_MODE=enforce: these were the only two violations in the whole app.
    //
    // If a sonner upgrade changes the second hash, toasts lose their styling and
    // nothing else breaks — the report-only default means it shows up as a report
    // before it can show up as a bug.
    `style-src 'self' 'nonce-${nonce}' ${SONNER_STYLE_HASHES.join(' ')}`,
    // TRAP 1: a nonce cannot authorise a style="..." ATTRIBUTE, and React SSR emits
    // them, as do @base-ui/react and sonner. Split out deliberately so
    // 'unsafe-inline' never reaches inline <style> ELEMENTS, which is where the
    // real injection risk lives.
    `style-src-attr 'unsafe-inline'`,
    // TRAP 2: the Supabase origin is required here, not just in connect-src. Twelve
    // /api/* routes 302 to a signed Storage URL and CSP checks the REDIRECT TARGET,
    // so 'self' alone silently breaks every private image — and every print-view
    // logo, which is how a school's paperwork stops looking like its paperwork.
    `img-src 'self' data: blob: ${origin}`,
    `font-src 'self'`, // next/font self-hosts; no fonts.gstatic.com
    `connect-src 'self' ${origin} ${ws}`,
    `object-src 'none'`,
    `base-uri 'none'`,
    // form-action does NOT inherit from default-src, so Server Actions need it named.
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `report-to csp-endpoint`,
    // Deprecated in CSP3 in favour of report-to, but still the one several shipping
    // browsers actually honour. Both may be present.
    `report-uri /api/csp-report`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

/** A <Link> prefetch must not carry a CSP.
 *
 *  A nonce baked into a cached prefetch payload will not match the document that
 *  later renders it. The Next.js guide narrows its matcher to avoid this; this
 *  proxy cannot be narrowed — it still has to run on prefetches for tenant and
 *  auth routing — so the header injection is skipped instead. */
export function isPrefetch(headers: Headers): boolean {
  return headers.get('next-router-prefetch') === '1' || headers.get('purpose') === 'prefetch'
}
