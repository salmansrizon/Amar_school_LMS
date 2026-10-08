'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Printer, X } from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import { isPrintPath } from '@/lib/print-path'

// Print as a popup (map 013): the print route (ADR 0007) loads in a preview
// dialog over the current page, and Print prints that frame — the user never
// leaves the page they were on. The one print entry in the app, so every print
// button behaves the same.

// #540: 44px thumb floor on a phone, compact pill on a pointer device.
const triggerClass =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'
const iconClass =
  'inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300'

/** The page's own language, set on <html> by the root layout. */
const docLang = (): Lang => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'bn')

export function PrintTrigger({
  href,
  label,
  icon,
  iconOnly = false,
}: {
  href: string
  label: string
  icon?: ReactNode
  /** Icon button (e.g. in a table row); `label` becomes its accessible name. */
  iconOnly?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const lang = docLang()

  return (
    <Dialog.Root onOpenChange={(open) => !open && setReady(false)}>
      <Dialog.Trigger aria-label={iconOnly ? label : undefined} className={iconOnly ? iconClass : triggerClass}>
        {icon ?? (iconOnly ? <Printer className="size-4" aria-hidden /> : null)}
        {!iconOnly && label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-3 z-50 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl bg-paper shadow-xl outline-none sm:inset-8">
          <header className="flex items-center gap-3 border-b border-line px-card py-3">
            <Dialog.Title className="min-w-0 flex-1 truncate font-bold">{label}</Dialog.Title>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                const win = frame.current?.contentWindow
                win?.focus()
                win?.print()
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <Printer className="size-4" aria-hidden />
              {t('print.print', lang)}
            </button>
            <Dialog.Close
              aria-label={t('common.close', lang)}
              className="inline-flex size-9 max-sm:size-11 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </header>
          <iframe
            ref={frame}
            src={href}
            title={label}
            className="w-full flex-1 bg-paper-muted"
            onLoad={() => {
              const win = frame.current?.contentWindow
              // An expired session redirects the print route to /login — never print that.
              const isPrint = Boolean(win && isPrintPath(win.location.pathname))
              if (win && isPrint) {
                // Preview what paper shows: hide the shell and the page's own
                // back/print row, exactly the elements marked `print:hidden`.
                const style = win.document.createElement('style')
                style.textContent = '.print\\:hidden{display:none!important}'
                win.document.head.appendChild(style)
              }
              setReady(isPrint)
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
