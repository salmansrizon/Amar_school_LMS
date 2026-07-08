export type LocationType = 'division' | 'district' | 'upazila' | 'union'

export const LOCATION_LEVELS: LocationType[] = ['division', 'district', 'upazila', 'union']

export const LOCATION_LABEL: Record<LocationType, { bn: string; en: string }> = {
  division: { bn: 'বিভাগ', en: 'Division' },
  district: { bn: 'জেলা', en: 'District' },
  upazila: { bn: 'উপজেলা', en: 'Upazila' },
  union: { bn: 'ইউনিয়ন', en: 'Union' },
}

export function childType(type: LocationType): LocationType | null {
  const i = LOCATION_LEVELS.indexOf(type)
  return LOCATION_LEVELS[i + 1] ?? null
}

export interface LocationRow {
  id: string
  name: string
  type: LocationType
  parent_id: string | null
}

export interface LocationNode extends LocationRow {
  children: LocationNode[]
}

export function buildTree(rows: LocationRow[]): LocationNode[] {
  const byId = new Map<string, LocationNode>(rows.map((r) => [r.id, { ...r, children: [] }]))
  const roots: LocationNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (nodes: LocationNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}
