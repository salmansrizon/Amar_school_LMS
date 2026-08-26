'use client'

import { SearchPalette, type PaletteEntry } from '@/components/search-palette'
import { StrokeIcon } from '@/components/stroke-icon'
import type { Lang } from '@/lib/i18n'

/** The student shell's ⌘K palette (#457).
 *
 *  Same component and same keyboard affordance every other role has. The static
 *  entries are the portal's own destinations; the dynamic record hits come from
 *  globalRecordSearch's `student` branch inside the palette itself. */
export function StudentSearchPalette({
  entries,
  lang,
  onClose,
}: {
  entries: { label: string; keywords: string[]; href: string }[]
  lang: Lang
  onClose: () => void
}) {
  const withIcons: PaletteEntry[] = entries.map((e) => ({
    ...e,
    icon: (
      <StrokeIcon className="size-4">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </StrokeIcon>
    ),
  }))
  return <SearchPalette entries={withIcons} lang={lang} onClose={onClose} />
}
