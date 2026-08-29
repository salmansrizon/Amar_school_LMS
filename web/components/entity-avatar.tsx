// Small square identity tile: a coloured block with the entity's initial. Shared
// by the super-admin schools + distributor reskins so both read like the
// reference cards. Colour is deterministic from the id (same entity keeps its
// colour) and purely decorative — always paired with the visible name.
const TONES = ['bg-brand-500', 'bg-sky-deep', 'bg-mint-deep', 'bg-sun-deep', 'bg-alert-deep'] as const

const DIM = {
  sm: 'size-8 rounded-lg text-xs',
  md: 'size-9 rounded-lg text-sm',
  lg: 'size-12 rounded-xl text-lg',
} as const

export function EntityAvatar({
  name,
  id,
  size = 'md',
}: {
  name: string
  id: string
  size?: keyof typeof DIM
}) {
  let h = 0
  for (const c of id) h = (h + c.charCodeAt(0)) % TONES.length
  return (
    <span
      className={`flex shrink-0 items-center justify-center font-bold text-white ${TONES[h]} ${DIM[size]}`}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
