// Soft decorative illustrations for the profile topic cards. Inline SVG,
// theme tokens only (so dark mode follows), aria-hidden, low contrast. The
// card hides them below 640px.
const base = 'h-24 w-36'

export function MapArt() {
  return (
    <svg viewBox="0 0 144 96" className={base} aria-hidden>
      <path d="M8 70 28 22l36 12 34-22 38 16-14 52-40 8-34-10z" className="fill-brand-100" />
      <path d="M28 22 40 78M64 34l8 48M98 12l-6 58" className="stroke-brand-300" strokeWidth="1.5" fill="none" />
      <path d="M100 18c-9 0-15 6-15 14 0 10 15 26 15 26s15-16 15-26c0-8-6-14-15-14z" className="fill-brand-500" />
      <circle cx="100" cy="32" r="5" className="fill-paper" />
    </svg>
  )
}

export function DocArt() {
  return (
    <svg viewBox="0 0 144 96" className={base} aria-hidden>
      <rect x="44" y="8" width="64" height="80" rx="8" className="fill-brand-100" />
      <rect x="54" y="20" width="36" height="8" rx="4" className="fill-brand-300" />
      <rect x="54" y="38" width="44" height="5" rx="2.5" className="fill-brand-300" />
      <rect x="54" y="50" width="30" height="5" rx="2.5" className="fill-brand-300" />
      <circle cx="108" cy="72" r="14" className="fill-sun-soft stroke-sun-deep" strokeWidth="2" />
      <circle cx="108" cy="72" r="7" className="fill-none stroke-sun-deep" strokeWidth="1.5" />
    </svg>
  )
}

export function SchoolArt() {
  return (
    <svg viewBox="0 0 144 96" className={base} aria-hidden>
      <rect x="20" y="46" width="104" height="44" rx="4" className="fill-brand-100" />
      <path d="M52 46V26l20-14 20 14v20z" className="fill-brand-300" />
      <path d="M72 12V2l12 4z" className="fill-brand-500" />
      <circle cx="72" cy="32" r="5" className="fill-paper" />
      <rect x="64" y="62" width="16" height="28" rx="2" className="fill-brand-500" />
      <g className="fill-paper">
        <rect x="30" y="56" width="10" height="10" rx="2" />
        <rect x="46" y="56" width="10" height="10" rx="2" />
        <rect x="88" y="56" width="10" height="10" rx="2" />
        <rect x="104" y="56" width="10" height="10" rx="2" />
      </g>
    </svg>
  )
}

export function FamilyArt() {
  return (
    <svg viewBox="0 0 144 96" className={base} aria-hidden>
      <circle cx="52" cy="26" r="11" className="fill-brand-300" />
      <path d="M32 80c0-18 8-30 20-30s20 12 20 30z" className="fill-brand-300" />
      <circle cx="94" cy="32" r="10" className="fill-brand-500" />
      <path d="M76 82c0-16 8-27 18-27s18 11 18 27z" className="fill-brand-500" />
      <circle cx="73" cy="52" r="7" className="fill-brand-100" />
      <path d="M62 82c0-10 5-17 11-17s11 7 11 17z" className="fill-brand-100" />
    </svg>
  )
}

export function SiblingsArt() {
  return (
    <svg viewBox="0 0 144 96" className={base} aria-hidden>
      <circle cx="50" cy="34" r="10" className="fill-brand-500" />
      <path d="M32 84c0-16 8-28 18-28s18 12 18 28z" className="fill-brand-500" />
      <circle cx="92" cy="46" r="8" className="fill-brand-300" />
      <path d="M78 84c0-12 6-22 14-22s14 10 14 22z" className="fill-brand-300" />
      <path d="M60 70l8-2 6 2" className="stroke-brand-100" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  )
}
