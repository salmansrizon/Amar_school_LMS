import { User, type LucideIcon } from 'lucide-react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { Card } from './page'
import { SectionTabs } from './section-tabs'

// Shared profile-detail shell (student + employee "person" pages, map
// owner-ui-overhaul). Layout per the reference: a full-width header card
// (round avatar, name, status, meta, actions), a narrow photo+key-facts
// aside, and a tabbed card of icon-badged sections on the right. Container
// queries, not viewport breakpoints, so the same markup fits the full page
// and the list's RecordDrawer (a fixed ~36rem column).

/** Full-width card: round avatar, name + status pill, one line of meta, and
 *  right-aligned actions. `actions` is one wrapping row of pills. */
export function ProfileHeader({
  name,
  status,
  meta,
  actions,
  avatar,
}: {
  name: string
  status: React.ReactNode
  /** One already-joined line, e.g. "Class: Eight / Day - A  |  Roll: 1". */
  meta?: string
  actions?: React.ReactNode
  /** A ProfileAvatar. */
  avatar?: React.ReactNode
}) {
  return (
    <Card className="mb-4 bg-gradient-to-r from-brand-50 to-paper">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 max-w-full flex-1 basis-80 items-center gap-4">
          {avatar}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="min-w-0 break-words text-2xl font-extrabold">{name}</h1>
              <span className="shrink-0">{status}</span>
            </div>
            {meta && <p className="mt-1.5 min-w-0 break-words text-sm text-muted">{meta}</p>}
          </div>
        </div>
        {/* White pills with a soft lift; each pill keeps its own hover tint. */}
        {actions && (
          <div className="flex flex-wrap items-center justify-end gap-2 [&>*]:bg-paper [&>*]:shadow-sm">{actions}</div>
        )}
      </div>
    </Card>
  )
}

/** Round avatar: the photo when there is one, else a person glyph on a brand
 *  tint. `xl` is the aside's large one. */
export function ProfileAvatar({
  src,
  alt = '',
  size = 'md',
}: {
  src?: string | null
  alt?: string
  size?: 'md' | 'xl'
}) {
  const dim = size === 'xl' ? 'size-36' : 'size-16 sm:size-20'
  const ring = 'shrink-0 rounded-full border-4 border-brand-50 ring-1 ring-brand-100'
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect route; next/image can't optimize it
    <img src={src} alt={alt} className={`${dim} ${ring} object-cover`} />
  ) : (
    <span className={`flex ${dim} ${ring} items-center justify-center bg-brand-100 text-brand-500`}>
      <User className={size === 'xl' ? 'size-16' : 'size-8 sm:size-10'} aria-hidden />
    </span>
  )
}

/** Narrow left column: a photo/placeholder slot, a key-facts list, and an
 *  optional tinted panel for a second cluster of facts. All three slots are
 *  optional so the aside also works for entities with no photo control. */
export function ProfileAside({
  photo,
  facts,
  highlight,
  more,
}: {
  photo?: React.ReactNode
  facts?: React.ReactNode
  highlight?: React.ReactNode
  /** Further facts below the tinted panel. */
  more?: React.ReactNode
}) {
  return (
    <div className="self-start rounded-2xl border border-line bg-paper p-card shadow-sm">
      {photo}
      {facts && (
        <>
          <div className={photo ? 'my-4 border-t border-line' : undefined} />
          <dl className="space-y-3">{facts}</dl>
        </>
      )}
      {highlight && <dl className="mt-4 space-y-3 rounded-xl bg-brand-50 p-3">{highlight}</dl>}
      {more && <dl className="mt-4 space-y-3">{more}</dl>}
    </div>
  )
}

/** Topic cards side by side: two columns from `lg`, one below. Cards keep
 *  their own height (`items-start`); a `span="full"` card takes the row. */
export function ProfileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-2 [&>section]:mb-0">{children}</div>
}

/** The right column's card: a tab row (real `?tab=` links, server-rendered, so
 *  reload and Back keep the tab) over the active tab's content. */
export function ProfileTabsCard({
  tabs,
  active,
  lang,
  label,
  children,
}: {
  tabs: readonly { key: string; labelKey: MessageKey }[]
  active: string
  lang: Lang
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-card shadow-sm">
      <SectionTabs
        tabs={tabs.map((x) => ({ href: `?tab=${x.key}`, labelKey: x.labelKey }))}
        active={`?tab=${active}`}
        lang={lang}
        label={label}
      />
      {children}
    </div>
  )
}

/** Section card: a round brand icon badge + bold title over a field grid.
 *  `cols` is the column count at the widest breakpoint (@4xl). */
export function ProfileSection({
  icon: Icon,
  title,
  cols = 4,
  span,
  art,
  empty,
  lang,
  children,
}: {
  icon: LucideIcon
  title: string
  /** `'flow'` skips the field grid for content that isn't dt/dd pairs, e.g.
   *  the Benefit Flags chips. */
  cols?: 2 | 3 | 4 | 'flow'
  /** Inside a ProfileGrid: take the whole row. */
  span?: 'full'
  /** Soft illustration (profile-art.tsx), bottom-right, hidden below 640px. */
  art?: React.ReactNode
  /** Every field is blank: show the muted "no information" line, not dashes.
   *  Needs `lang`. */
  empty?: boolean
  lang?: Lang
  children: React.ReactNode
}) {
  return (
    // @container: the field grid follows THIS card's width.
    <section
      className={`@container relative mb-4 overflow-hidden rounded-2xl border border-line bg-paper p-card ${span === 'full' ? 'lg:col-span-2' : ''}`}
    >
      {art && (
        <span aria-hidden className="pointer-events-none absolute bottom-1 right-2 hidden opacity-60 sm:block">
          {art}
        </span>
      )}
      <div className="relative mb-4 flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <Icon className="size-5" aria-hidden />
        </span>
        <h3 className="text-base font-bold">{title}</h3>
      </div>
      {empty && lang ? (
        <p className="relative pb-2 text-sm text-muted">{t('profile.noInfo', lang)}</p>
      ) : cols === 'flow' ? (
        <div className="relative flex flex-wrap gap-2">{children}</div>
      ) : (
        <dl className={`relative ${GRID_COLS[cols]}`}>{children}</dl>
      )}
    </section>
  )
}

// Hairline between rows (not columns), as in the reference; none under the last.
const ROWS = '[&>*]:border-b [&>*]:border-line [&>*]:pb-3 [&>*:last-child]:border-b-0'
const GRID_COLS: Record<2 | 3 | 4, string> = {
  2: `grid gap-x-8 gap-y-3 @sm:grid-cols-2 ${ROWS}`,
  3: `grid gap-x-8 gap-y-3 @sm:grid-cols-2 @4xl:grid-cols-3 ${ROWS}`,
  4: `grid gap-x-8 gap-y-3 @sm:grid-cols-2 @4xl:grid-cols-4 ${ROWS}`,
}

/** One field: a round soft icon tile, a muted label and the value — "—" when
 *  empty. Used loose (the aside's key-facts list) and inside a section grid. */
export function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon?: LucideIcon
  label: string
  value?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && (
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted">{label}</dt>
        <dd className="break-words text-sm font-medium">{value ?? <span className="font-normal text-muted">—</span>}</dd>
      </div>
    </div>
  )
}
