'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import { withParams } from '@/lib/url-params'

// Record view/edit over the list (map 013, F3). The page's server component
// reads `?view=<id>`, fetches the record and renders it as `children`; this
// component only presents it. Opening is a plain <Link> (see ViewLink), so the
// server renders the content and refresh/back/share all work.
// ponytail: opening re-runs the page's server render, list included. If S2
// measures it over budget, fetch drawer content client-side and switch the
// URL update to window.history.pushState.

export function RecordDrawer({
  open,
  title,
  subtitle,
  fullPageHref,
  fullPageLabel,
  closeLabel,
  header,
  footer,
  children,
}: {
  open: boolean
  title: string
  subtitle?: string
  fullPageHref?: string
  fullPageLabel: string
  closeLabel: string
  /** Custom header content (avatar/name/status — see drawer-parts.tsx's
   *  DrawerHeader) in place of the plain title/subtitle block below. `title`
   *  is still required: it becomes an sr-only Drawer.Title for a11y. */
  header?: React.ReactNode
  /** Sticky footer under the scrollable body — see drawer-parts.tsx's
   *  DrawerFooter (Cancel + one primary action). */
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const view = params.get('view')

  const close = () => {
    const next = withParams(Object.fromEntries(params.entries()), {
      view: null,
    })
    router.replace(`${pathname}${next}`, { scroll: false })
  }

  return (
    <Drawer.Root open={open} swipeDirection="right" onOpenChange={(o) => !o && close()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex justify-end">
          <Drawer.Popup
            // Focus goes back to the row's Profile link, not to <body>.
            finalFocus={() => (view && document.querySelector<HTMLElement>(`[data-view-link="${view}"]`)) || true}
            className="flex h-full w-full max-w-xl flex-col bg-paper shadow-xl outline-none transition-[translate] duration-200 [transform:translateX(var(--drawer-swipe-movement-x,0px))] data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full"
          >
            <header className="flex items-start gap-3 border-b border-line px-card py-4">
              {header ? (
                <>
                  <Drawer.Title className="sr-only">{title}</Drawer.Title>
                  {header}
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <Drawer.Title className="truncate text-lg font-extrabold">{title}</Drawer.Title>
                  {subtitle && <Drawer.Description className="text-sm text-muted">{subtitle}</Drawer.Description>}
                </div>
              )}
              {fullPageHref && (
                <Link
                  href={fullPageHref}
                  className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong px-3 text-xs font-semibold hover:bg-paper-muted"
                >
                  {fullPageLabel} <span aria-hidden>↗</span>
                </Link>
              )}
              <Drawer.Close
                aria-label={closeLabel}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <X className="size-4" aria-hidden />
              </Drawer.Close>
            </header>
            <div className="flex-1 overflow-y-auto p-card">{children}</div>
            {footer && <div className="shrink-0 border-t border-line bg-paper p-card">{footer}</div>}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
