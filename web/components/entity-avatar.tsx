'use client'

import { useState } from 'react'
import { photoBroken } from '@/lib/photos'

// Small square identity tile: a coloured block with the entity's initial. Shared
// by the super-admin schools + distributor reskins so both read like the
// reference cards. Colour is deterministic from the id (same entity keeps its
// colour) and purely decorative — always paired with the visible name.
//
// With `src` the person's picture is laid over the same box. The letter tile
// stays underneath, so it is what shows while the picture loads and whenever
// it fails (a broken or expired signed URL never leaves an empty box).
const TONES = ['bg-brand-500', 'bg-sky-deep', 'bg-mint-deep', 'bg-sun-deep', 'bg-alert-deep'] as const

const DIM = {
  sm: 'size-8 rounded-lg text-xs',
  md: 'size-9 rounded-lg text-sm',
  lg: 'size-12 rounded-xl text-lg',
  xl: 'size-28 rounded-md text-4xl',
} as const

// The same boxes in px, for the <img> width/height (no layout shift).
const PX = { sm: 32, md: 36, lg: 48, xl: 112 } as const

export function EntityAvatar({
  name,
  id,
  size = 'md',
  src,
}: {
  name: string
  id: string
  size?: keyof typeof DIM
  /** Picture URL; omit (or null) for the letter tile alone. */
  src?: string | null
}) {
  // The URL that failed, not a boolean: a re-render with a fresh URL tries again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  let h = 0
  for (const c of id) h = (h + c.charCodeAt(0)) % TONES.length
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center font-bold text-white ${TONES[h]} ${DIM[size]}`}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
      {src && src !== failedSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL; next/image can't optimize it
        <img
          src={src}
          alt=""
          width={PX[size]}
          height={PX[size]}
          loading="lazy"
          decoding="async"
          ref={(el) => {
            if (el && photoBroken(el)) setFailedSrc(src)
          }}
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 size-full rounded-[inherit] object-cover"
        />
      )}
    </span>
  )
}
