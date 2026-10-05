'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

/** The open <dialog> a popup is rendered inside, or null on a plain page.
 *
 *  showModal() puts the dialog in the browser's top layer, above everything in
 *  <body> whatever its z-index, and makes the rest of the page inert. A popup
 *  portaled to <body> (combobox, select, menu) is then drawn behind the dialog
 *  and cannot be clicked. Popups read this and portal into the dialog instead. */
const DialogContainer = createContext<HTMLElement | null>(null)
export const useDialogContainer = () => useContext(DialogContainer)

/** The one dialog primitive behind Modal and ConfirmDialog.
 *
 *  A native <dialog> opened with showModal() gives, for free and correctly:
 *  focus moves in on open, Tab stays inside, the page behind is inert, Escape
 *  fires `cancel`, and close() puts focus back on the element that opened it.
 *
 *  `onRequestClose` is asked for on Escape and on a backdrop click; the caller
 *  decides (ConfirmDialog refuses while its action is pending) by flipping
 *  `open`. Content is only mounted while open, so forms reset on dismissal. */
export function NativeDialog({
  open,
  onRequestClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean
  onRequestClose: () => void
  labelledBy: string
  className: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [el, setEl] = useState<HTMLDialogElement | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={(node) => {
        ref.current = node
        setEl(node)
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      // Escape: stop the browser closing it behind React's back.
      onCancel={(e) => {
        e.preventDefault()
        onRequestClose()
      }}
      // A click on the ::backdrop lands on the <dialog> itself, outside its box.
      onMouseDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        if (e.target === e.currentTarget && outside) onRequestClose()
      }}
      className={`m-auto w-[calc(100%-2rem)] backdrop:bg-black/40 ${className}`}
    >
      {open && <DialogContainer.Provider value={el}>{children}</DialogContainer.Provider>}
    </dialog>
  )
}
