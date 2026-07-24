'use client'

import { useRef, useState } from 'react'

// Same-page print entry (issue #116). Replaces the old new-tab link: loads the
// print route into a hidden same-origin iframe and fires the browser print
// dialog in place, so the user never leaves /school/students/[id]. Reuses the
// print routes (ADR 0007) — printable markup + @media rules stay in one place.

const triggerClass =
  'cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

export function PrintTrigger({ href, label }: { href: string; label: string }) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  function print() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)

    const iframe = document.createElement('iframe')
    // Off-screen but sized to an A4 sheet so the route lays out at print width.
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;'

    let done = false
    const cleanup = () => {
      if (done) return
      done = true
      clearTimeout(guard)
      if (iframe.parentNode) document.body.removeChild(iframe)
      busyRef.current = false
      setBusy(false)
    }
    // Armed before load so a failed/stuck load still releases the button.
    const guard = setTimeout(cleanup, 60000)

    iframe.onload = () => {
      const win = iframe.contentWindow
      if (!win) return cleanup()
      // An expired session redirects the print route to /login — don't print that.
      if (!win.location.pathname.includes('/print/')) return cleanup()
      // Wait for images (logo, QR) so they aren't missing on the sheet.
      const images = Array.from(win.document.images)
      Promise.all(
        images.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true })
                img.addEventListener('error', () => resolve(), { once: true })
              }),
        ),
      ).then(() => {
        win.addEventListener('afterprint', cleanup, { once: true })
        win.focus()
        win.print()
      })
    }

    iframe.src = href
    document.body.appendChild(iframe)
  }

  return (
    <button type="button" onClick={print} disabled={busy} className={triggerClass}>
      {label}
    </button>
  )
}
