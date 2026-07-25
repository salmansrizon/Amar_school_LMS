import { LOCATION_LABEL } from '@/lib/locations'
import { t, type Lang } from '@/lib/i18n'
import { RemoveAssignmentButton } from './assignment-controls'

export interface AssignmentRow {
  id: string
  tier: string | null
  locations: unknown
  schools: unknown
}

// The territory-assignment list, shared by the partner detail (#49) and the
// gov-official detail (#164) so both render locations, extended-school-access
// badges and tiers identically from one place.
export function AssignmentList({
  assignments,
  assigneeId,
  lang,
}: {
  assignments: AssignmentRow[]
  assigneeId: string
  lang: Lang
}) {
  if (!assignments.length) return <p className="text-sm text-muted">{t('partners.none', lang)}</p>
  return (
    <ul className="divide-y divide-line">
      {assignments.map((a) => {
        const location = a.locations as { name: string; type: keyof typeof LOCATION_LABEL } | null
        const school = a.schools as { name: string } | null
        return (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              {location && (
                <>
                  <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                    {LOCATION_LABEL[location.type][lang]}
                  </span>
                  <span className="font-medium">{location.name}</span>
                </>
              )}
              {school && (
                <>
                  <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
                    {t('territory.extended', lang)}
                  </span>
                  <span className="font-medium">{school.name}</span>
                </>
              )}
              {a.tier && (
                <span className="text-xs text-muted">
                  {t('partners.tier', lang)}: {a.tier}
                </span>
              )}
            </span>
            <RemoveAssignmentButton id={a.id} assigneeId={assigneeId} label={t('partners.remove', lang)} />
          </li>
        )
      })}
    </ul>
  )
}
