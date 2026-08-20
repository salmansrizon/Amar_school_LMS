'use client'

import { useId, useMemo, useState } from 'react'
import { LOCATION_LABEL, LOCATION_LEVELS, childrenAt, type LocationRow, type LocationType } from '@/lib/locations'
import type { Lang } from '@/lib/i18n'

const inputClass =
  'h-9 w-40 rounded-md border border-line-strong bg-paper px-3 text-sm outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-60'

type Chain = Record<LocationType, LocationRow | null>
const EMPTY_CHAIN: Chain = { division: null, district: null, upazila: null, union: null }

function levelIndex(type: LocationType) {
  return LOCATION_LEVELS.indexOf(type)
}

/** Type-to-search division → district → upazila → union picker (native
 *  `<input list>` + `<datalist>`, matching the combobox pattern already used
 *  for employee category, web/app/school/employees/new/create-form.tsx) —
 *  replaces a single flat `<select>` of every Location, which stopped being
 *  usable once the tree grew past ~5,000 rows (#116-#118). Selecting a level
 *  clears every deeper level, since its candidates depend on the parent.
 *  Submits as a single hidden `name` field, so it's a drop-in replacement for
 *  the flat select at every call site. */
export function LocationPicker({
  locations,
  name,
  lang,
  required = false,
}: {
  locations: LocationRow[]
  name: string
  lang: Lang
  required?: boolean
}) {
  const [chain, setChain] = useState<Chain>(EMPTY_CHAIN)
  const [drafts, setDrafts] = useState<Record<LocationType, string>>({
    division: '',
    district: '',
    upazila: '',
    union: '',
  })
  const idPrefix = useId()

  const candidates = useMemo(() => {
    const result = {} as Record<LocationType, LocationRow[]>
    for (const level of LOCATION_LEVELS) {
      const parentType = LOCATION_LEVELS[levelIndex(level) - 1]
      const parentId = parentType ? chain[parentType]?.id ?? null : null
      result[level] = parentType && !chain[parentType] ? [] : childrenAt(locations, level, parentId)
    }
    return result
  }, [locations, chain])

  const resolvedId = chain.union?.id ?? chain.upazila?.id ?? chain.district?.id ?? chain.division?.id ?? ''

  function handleChange(level: LocationType, text: string) {
    const match = candidates[level].find((c) => c.name.toLowerCase() === text.trim().toLowerCase())
    setDrafts((prev) => {
      const next = { ...prev, [level]: text }
      for (const deeper of LOCATION_LEVELS.slice(levelIndex(level) + 1)) next[deeper] = ''
      return next
    })
    setChain((prev) => {
      const next = { ...prev, [level]: match ?? null }
      for (const deeper of LOCATION_LEVELS.slice(levelIndex(level) + 1)) next[deeper] = null
      return next
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={resolvedId} required={required} />
      {LOCATION_LEVELS.map((level) => {
        const parentType = LOCATION_LEVELS[levelIndex(level) - 1]
        const disabled = parentType ? !chain[parentType] : false
        const listId = `${idPrefix}-${level}`
        return (
          <input
            key={level}
            list={listId}
            value={drafts[level]}
            disabled={disabled}
            placeholder={LOCATION_LABEL[level][lang]}
            onChange={(e) => handleChange(level, e.target.value)}
            className={inputClass}
          />
        )
      })}
      {LOCATION_LEVELS.map((level) => (
        <datalist key={level} id={`${idPrefix}-${level}`}>
          {candidates[level].map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      ))}
    </div>
  )
}
