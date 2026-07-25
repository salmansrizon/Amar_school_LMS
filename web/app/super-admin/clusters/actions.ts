'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

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
