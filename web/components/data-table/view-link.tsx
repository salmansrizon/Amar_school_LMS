import Link from 'next/link'
import { withParams, type Params } from '@/lib/url-params'

/** The row's "Profile" button: opens the record drawer by setting `?view=`. */
export function ViewLink({ id, params, label, name }: { id: string; params: Params; label: string; name: string }) {
  return (
    <Link
      href={withParams(params, { view: id })}
      scroll={false}
      data-view-link={id}
      aria-label={`${label}: ${name}`}
      className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {label}
    </Link>
  )
}
