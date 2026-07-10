'use client'

import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'

export function ClassPicker({
  classes,
  selected,
  lang,
}: {
  classes: { id: string; name: string; section: string | null }[]
  selected: string
  lang: Lang
}) {
  const router = useRouter()
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`/school/students/subject-assignment?class=${e.target.value}`)}
      className="min-w-40 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
      aria-label={t('subjects.pickClass', lang)}
    >
      <option value="" disabled>
        {t('subjects.pickClass', lang)}
      </option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.section ? ` - ${c.section}` : ''}
        </option>
      ))}
    </select>
  )
}
