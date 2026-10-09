'use client'
import { useEffect, useRef } from 'react'

// Scrolls the parent's [aria-current] child into view horizontally on mount,
// so an overflowing tab row opens on the active tab. Renders nothing visible.
export function ScrollActive() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const box = ref.current?.parentElement
    const el = box?.querySelector<HTMLElement>('[aria-current]')
    if (!box || !el || box.scrollWidth <= box.clientWidth) return
    box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2
  }, [])
  return <span ref={ref} hidden />
}
