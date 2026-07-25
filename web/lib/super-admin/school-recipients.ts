// Super-admin SMS recipient resolution (map #158, ticket #165). Pure functions
// mirroring the SQL `schools_under_location` (migration 0004): a school belongs
// to a location node if its location_id sits in the node's subtree, OR its
// cluster's location_id does. Same logic backs the compose page's live
// recipient count and the send action, so the preview never lies.

// Shared `.select()` column list — the compose page (live preview) and the send
// action must resolve recipients from the exact same school shape, so neither
// drifts. Mirrors the school-side COMPOSE_*_COLUMNS convention.
export const SCHOOL_RECIPIENT_COLUMNS = 'id, name, mobile, location_id, cluster_id'

export interface SchoolRecipientRow {
  id: string
  name: string
  mobile: string | null
  location_id: string | null
  cluster_id: string | null
}

export interface LocationEdge {
  id: string
  parent_id: string | null
}

export interface ClusterEdge {
  id: string
  location_id: string | null
}

/** All location ids in the subtree rooted at `rootId` (inclusive). */
function subtreeLocationIds(locations: LocationEdge[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const l of locations) {
    if (!l.parent_id) continue
    const list = childrenByParent.get(l.parent_id) ?? []
    list.push(l.id)
    childrenByParent.set(l.parent_id, list)
  }
  const ids = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    if (ids.has(id)) continue
    ids.add(id)
    for (const child of childrenByParent.get(id) ?? []) stack.push(child)
  }
  return ids
}

/** Schools under a location node (its subtree), directly or via their cluster.
 *  `locationId === null` means "all schools" (no area filter). */
export function schoolsUnderLocation(
  schools: SchoolRecipientRow[],
  locations: LocationEdge[],
  clusters: ClusterEdge[],
  locationId: string | null,
): SchoolRecipientRow[] {
  if (locationId === null) return schools
  const nodeIds = subtreeLocationIds(locations, locationId)
  const clustersUnder = new Set(
    clusters.filter((c) => c.location_id && nodeIds.has(c.location_id)).map((c) => c.id),
  )
  return schools.filter(
    (s) =>
      (s.location_id && nodeIds.has(s.location_id)) ||
      (s.cluster_id && clustersUnder.has(s.cluster_id)),
  )
}

export interface SchoolSmsRecipient {
  schoolId: string
  name: string
  phone: string
}

/** Schools with a registered mobile become recipients; the rest are skipped. */
export function schoolSmsRecipients(schools: SchoolRecipientRow[]): SchoolSmsRecipient[] {
  return schools
    .filter((s): s is SchoolRecipientRow & { mobile: string } => !!s.mobile)
    .map((s) => ({ schoolId: s.id, name: s.name, phone: s.mobile }))
}
