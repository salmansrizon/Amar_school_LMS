// One 24x24 stroke-SVG wrapper for the inline Lucide-style icons used across the
// super-admin shell and dashboard primitives (map #171, T1). `children` are the
// raw path/rect/circle elements; the wrapper fixes viewBox, stroke and caps so
// every icon inherits text colour and lines up. Extracted so the identical SVG
// boilerplate isn't repeated at each call site.

export function StrokeIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}
