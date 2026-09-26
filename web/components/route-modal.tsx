'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

// A task page shown as a popup over the list (map 013). Rendered only by an
// intercepting route in `app/school/@modal` — soft navigation from a row opens
// it; a refresh or direct URL renders the page itself, full size. Closing (Esc,
// ✕, backdrop) is `router.back()`, so the list comes back with its filters and
// page untouched. Only the page's breadcrumbs are hidden in here; its Back
// chevron stays (it links to the list, which the @modal catch-all turns into
// "close"), so everything else is the page, unchanged.

export function RouteModal({
  title,
  closeLabel,
  children,
}: {
  title: string
  closeLabel: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    // Go back only once the close animation has finished (instant under
    // reduced motion), so the popup never vanishes mid-fade.
    <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={(o) => !o && router.back()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/40 motion-safe:transition-opacity motion-safe:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        {/* Opacity only, never a transform: a transformed popup would trap the
            page's own fixed overlays (confirm dialogs etc.) inside itself. */}
        <Dialog.Popup className="fixed inset-2 z-50 mx-auto flex max-w-7xl flex-col overflow-hidden rounded-2xl bg-paper shadow-xl outline-none motion-safe:transition-opacity motion-safe:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:inset-6">
          <header className="flex items-center gap-3 border-b border-line px-card py-3">
            <Dialog.Title className="min-w-0 flex-1 truncate text-lg font-extrabold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={closeLabel}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </header>
          <div className="@container min-h-0 flex-1 overflow-y-auto p-card [&_[data-page-crumbs]]:hidden">
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
