// EdumeBD brand mark — a graduation cap, drawn in `currentColor` so it inherits
// the text colour of whatever chip it sits in (white inside the brand boxes).
// Sizing is left to the caller via `className` (e.g. `size-5`), so it stays
// crisp on every device without its own breakpoints.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 3.2 22.2 8 12 12.8 1.8 8 12 3.2Z" fill="currentColor" />
      <path
        d="M6 10.4v3.6c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M20.4 9v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
