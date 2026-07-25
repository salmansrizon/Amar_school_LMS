import { describe, it, expect } from 'vitest'
import {
  schoolsUnderLocation,
  schoolSmsRecipients,
  type SchoolRecipientRow,
} from '@/lib/super-admin/school-recipients'

// Location tree:  div(d) → dist(t) → upz(u).  Cluster c under dist(t).
const locations = [
  { id: 'd', parent_id: null },
  { id: 't', parent_id: 'd' },
  { id: 'u', parent_id: 't' },
]
const clusters = [{ id: 'c', location_id: 't' }]

const schools: SchoolRecipientRow[] = [
  { id: 's-u', name: 'Upazila School', mobile: '01710000001', location_id: 'u', cluster_id: null },
  { id: 's-c', name: 'Cluster School', mobile: '01710000002', location_id: null, cluster_id: 'c' },
  { id: 's-out', name: 'Outside School', mobile: '01710000003', location_id: 'other', cluster_id: null },
  { id: 's-nomob', name: 'No Mobile', mobile: null, location_id: 'u', cluster_id: null },
]

describe('schoolsUnderLocation', () => {
  it('null location → every school', () => {
    expect(schoolsUnderLocation(schools, locations, clusters, null)).toHaveLength(4)
  })
  it('division root includes deep-subtree + cluster schools, excludes outsiders', () => {
    const ids = schoolsUnderLocation(schools, locations, clusters, 'd').map((s) => s.id)
    expect(ids.sort()).toEqual(['s-c', 's-nomob', 's-u'])
  })
  it('upazila node includes only its own schools (cluster is under district, not upazila)', () => {
    const ids = schoolsUnderLocation(schools, locations, clusters, 'u').map((s) => s.id)
    expect(ids.sort()).toEqual(['s-nomob', 's-u'])
  })
  it('district node includes the cluster school', () => {
    const ids = schoolsUnderLocation(schools, locations, clusters, 't').map((s) => s.id)
    expect(ids).toContain('s-c')
  })
})

describe('schoolSmsRecipients', () => {
  it('keeps schools with a mobile, drops those without', () => {
    const r = schoolSmsRecipients(schools)
    expect(r.map((x) => x.schoolId).sort()).toEqual(['s-c', 's-out', 's-u'])
    expect(r[0]).toHaveProperty('phone')
  })
})
