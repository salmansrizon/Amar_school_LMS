import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

// The five designed states (#538). A blank region is never an answer: the reader
// must be able to tell absence from loading from refusal from failure, and be
// given one thing to do next.
//
// Loading is not here — Next.js owns it through `loading.tsx`, one per role
// segment, and a skeleton is layout-specific by nature.
//
// These take `lang` rather than reading it, so a client component can render one
// without dragging `next/headers` across the server boundary.

const cardClass = 'rounded-2xl border border-line/70 bg-paper/92 p-8 text-center shadow-card'

function Action({ href, label, tone }: { href: string; label: string; tone: 'primary' | 'quiet' }) {
  // h-11 is 44px — the phone-first floor (#540), applied here because these are
  // often the only action on the screen.
  return (
    <Link
      href={href}
      className={
        tone === 'primary'
          ? 'inline-flex h-11 items-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600'
          : 'inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold hover:bg-paper-muted'
      }
    >
      {label}
    </Link>
  )
}

/** Nothing here yet — and the one thing that would change that.
 *
 *  `action` is not optional by accident. An empty list with no way out is the
 *  state the UAT pass complained about most: the reader cannot tell whether the
 *  school has no students or the screen is broken. */
export function EmptyState({
  title,
  body,
  action,
  lang,
}: {
  title: string
  body?: string
  action: { href: string; label: string }
  lang: Lang
}) {
  return (
    <div className={cardClass}>
      <h2 className="text-base font-bold">{title}</h2>
      {body && <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>}
      <p className="mt-5">
        <Action href={action.href} label={action.label} tone="primary" />
      </p>
      <p className="sr-only">{t('states.emptyAnnounce', lang)}</p>
    </div>
  )
}

/** A value the reader can see is not a number — zero, blank, negative.
 *
 *  Rendered next to the figure rather than in place of it, because the figure is
 *  the evidence and the sentence is the reason. */
export function ValueNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted">{children}</p>
}

/** Refused, with the destination remembered.
 *
 *  Two ways out, both real: back to a screen the reader can definitely open, and
 *  the person who can grant the one they wanted. `contactHref` is omitted rather
 *  than faked when the school has recorded no number. */
export function DeniedState({
  destination,
  homeHref,
  contactHref,
  contactLabel,
  lang,
}: {
  /** The path the reader was trying to reach, shown so they can say what they need. */
  destination?: string | null
  homeHref: string
  contactHref?: string | null
  contactLabel?: string | null
  lang: Lang
}) {
  return (
    <div className="flex items-center justify-center p-6">
      <div className={`w-full max-w-md ${cardClass}`}>
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-alert-soft text-2xl">
          🚫
        </div>
        <h1 className="text-xl font-bold">{t('denied.title', lang)}</h1>
        <p className="mt-2 text-sm text-muted">{t('denied.body', lang)}</p>
        {destination && (
          <p className="mt-3 rounded-md bg-paper-muted px-3 py-2 text-xs">
            <span className="font-semibold text-muted">{t('denied.destination', lang)}: </span>
            <code>{destination}</code>
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Action href={homeHref} label={t('denied.back', lang)} tone="primary" />
          {contactHref && <Action href={contactHref} label={contactLabel ?? t('denied.contact', lang)} tone="quiet" />}
        </div>
      </div>
    </div>
  )
}

/** Something failed. The reader gets a sentence, a retry and a reference.
 *
 *  Never the thrown message: a Postgres error names tables and columns, and the
 *  UAT pass called raw technical text out by name. `reference` is Next's error
 *  digest — the same string that appears in the server log, which is what makes
 *  a support call answerable. */
export function ErrorState({
  reference,
  onRetry,
  homeHref,
  lang,
}: {
  reference?: string
  onRetry?: () => void
  homeHref: string
  lang: Lang
}) {
  return (
    <div className="flex items-center justify-center p-6">
      <div className={`w-full max-w-md ${cardClass}`}>
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-sun-soft text-2xl">⚠️</div>
        <h1 className="text-xl font-bold">{t('states.errorTitle', lang)}</h1>
        <p className="mt-2 text-sm text-muted">{t('states.errorBody', lang)}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 cursor-pointer items-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              {t('states.retry', lang)}
            </button>
          )}
          <Action href={homeHref} label={t('states.goHome', lang)} tone="quiet" />
        </div>
        {reference && (
          <p className="mt-4 text-xs text-muted">
            {t('states.reference', lang)}: <code>{reference}</code>
          </p>
        )}
      </div>
    </div>
  )
}
