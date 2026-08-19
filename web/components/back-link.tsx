import Link from 'next/link'
import { restoresOwnScroll } from '@/lib/back-nav'

// The header Back chevron. This markup was pasted into 75 page files; map #373
// converted the 22 under app/school/exams and deliberately left the rest, so
// the other ~53 still carry their own copy until a later effort sweeps them up.
//
// Deliberately dumb: it renders a link and nothing else. It does not read the
// URL, touch history, or know any route — each page resolves its own target
// with `resolveBackHref(from, itsStructuralParent)` (lib/back-nav.ts) and
// passes the answer in, so route knowledge stays in the route.

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      // Yield scroll to a destination that restores its own row anchor;
      // otherwise keep Next's default scroll-to-top.
      scroll={!restoresOwnScroll(href)}
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </Link>
  )
}
