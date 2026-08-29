'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Cluster management (map #158, ticket #167) over the existing clusters table +
// schools.cluster_id (0003/0004). RLS "super admin manages clusters" is the
// authority; these give clean errors + revalidate the page. Cluster create +
// delete are shared with the locations tree (locations/actions addCluster /
// deleteCluster); this file owns the membership + rename actions unique to the
// clusters page.

/** Rename a cluster. */
export async function renameCluster(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const trimmed = name.trim()
  if (!trimmed) return { error: 'name required' }
  const { error } = await supabase.from('clusters').update({ name: trimmed }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/clusters')
  return {}
}

/** Assign a school to a cluster, or clear it (clusterId = null). A school
 *  belongs to at most one cluster (schools.cluster_id). */
export async function setSchoolCluster(
  schoolId: string,
  clusterId: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('schools').update({ cluster_id: clusterId }).eq('id', schoolId)
  if (error) return { error: error.message }
  revalidatePath('/super-admin/clusters')
  return {}
}

/** Assign a Distributor (or Gov Official) to a Cluster (0119 — territory_
 *  assignments.cluster_id). The DB's territory_conflict_check trigger is the
 *  actual guard: it rejects the insert if any of the Cluster's Schools are
 *  already reachable by a DIFFERENT assignee (via that assignee's own School,
 *  Location, or Cluster row), with a message naming who and how many —
 *  surfaced here (not swallowed by pgErrorMessage's generic P0001 fallback)
 *  since it's written to be shown directly. */
export async function assignClusterDistributor(
  clusterId: string,
  assigneeId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('territory_assignments').insert({
    assignee_id: assigneeId,
    cluster_id: clusterId,
  })
  if (error) return { error: pgErrorMessage(error, { P0001: error.message }) }
  revalidatePath('/super-admin/clusters')
  return {}
}

/** Remove a Cluster's distributor assignment. */
export async function removeClusterAssignment(assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('territory_assignments').delete().eq('id', assignmentId)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/clusters')
  return {}
}
