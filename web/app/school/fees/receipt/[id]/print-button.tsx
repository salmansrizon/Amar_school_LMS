'use client'

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
    >
      {label}
    </button>
  )
}
