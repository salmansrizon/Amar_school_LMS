'use client'

import { useRef, useState } from 'react'

// Same-page print trigger (issue #116). Instead of opening the print route in a
// new tab (where the user had to click again), this loads it into a hidden
// same-origin iframe and fires the browser print dialog in place — the user
// never leaves the student page. Reuses the existing print routes (ADR 0007),
// so the printable markup + @media rules stay in one place.
export function PrintLink({
  href,
  label,
  className,
}: {
  href: string
  label: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  function print() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)

    const iframe = document.createElement('iframe')
    // Off-screen but sized to an A4 sheet so the route lays out at print width
    // (a 0×0 iframe would render the content collapsed).
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText =
      'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;'
    iframe.src = href

    const cleanup = () => {
      if (iframe.parentNode) document.body.removeChild(iframe)
      busyRef.current = false
      setBusy(false)
    }

    iframe.onload = () => {
      const win = iframe.contentWindow
      if (!win) {
        cleanup()
        return
      }
      // Remove the iframe once the dialog closes; fall back on a timeout in
      // case afterprint never fires (some engines).
      win.addEventListener('afterprint', cleanup, { once: true })
      setTimeout(cleanup, 60000)
      win.focus()
      win.print()
    }

    document.body.appendChild(iframe)
  }

  return (
    <button type="button" onClick={print} disabled={busy} className={className}>
      {label}
    </button>
  )
}
