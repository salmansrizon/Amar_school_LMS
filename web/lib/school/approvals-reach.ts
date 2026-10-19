import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/auth/routing'

// Which pending approvals a school member sees (#689).
//
// `approvals` is a `member` screen and workflow_instances RLS is school-wide
// (0082), so a Staff User with no grant saw the whole School's queue and its
// count. Decision taken (conservative, reversible): a member sees an instance
// only when it is in their reach —
//   a. the School Owner: everything (unchanged);
//   b. an approver of the instance's current stage (role or named user);
//   c. the person who started it;
//   d. someone who already decided an earlier stage;
//   e. office staff holding the Attendance grant, for the attendance workflows
//      (they already read the leave tables with that grant).
//
// Migration 0243 is the same rule in RLS. This file applies it in the app so
// the screens are right before 0243 is applied; after it, the database has
// already filtered and this filter changes nothing. To reverse: return every
// row from `instancesInReach` and do not apply 0243.

/** The workflows office staff with the Attendance grant keep (rule e). Keep in
 *  step with the list in 0243. */
export const ATTENDANCE_WORKFLOWS: readonly string[] = ['leave_approval', 'attendance_correction']

export interface ReachInstance {
  id: string
  definition_key: string
  current_seq: number
  initiator_id: string | null
}

export interface ReachStage {
  definition_key: string
  seq: number
  approver_role: string | null
  approver_user: string | null
}

export interface ReachViewer {
  role: Role
  userId: string
  /** Office staff (no employees row) holding the Attendance grant. */
  officeAttendance: boolean
  /** Instances the viewer already decided a stage of. */
  decided: ReadonlySet<string>
}

/** Pure: is this instance in the viewer's reach? */
export function instanceInReach(i: ReachInstance, stages: readonly ReachStage[], viewer: ReachViewer): boolean {
  if (viewer.role === 'school_owner') return true
  if (viewer.role !== 'staff_user') return false
  if (i.initiator_id === viewer.userId) return true
  if (viewer.decided.has(i.id)) return true
  if (viewer.officeAttendance && ATTENDANCE_WORKFLOWS.includes(i.definition_key)) return true
  return stages.some(
    (s) =>
      s.definition_key === i.definition_key &&
      s.seq === i.current_seq &&
      (s.approver_role === viewer.role || s.approver_user === viewer.userId),
  )
}

/** Pure: the instances in the viewer's reach, order kept. */
export function instancesInReach<T extends ReachInstance>(
  instances: readonly T[],
  stages: readonly ReachStage[],
  viewer: ReachViewer,
): T[] {
  return instances.filter((i) => instanceInReach(i, stages, viewer))
}

export interface PendingApproval extends ReachInstance {
  entity_type: string
  entity_id: string
  created_at: string
}

/** The in-progress instances the caller may see, newest first. The Owner costs
 *  the one query the page always made; a Staff User costs three small reads
 *  more (stages, own decisions, class scope). */
export async function pendingApprovalsInReach(
  supabase: SupabaseClient,
  viewer: { role: Role; userId: string; grants: readonly string[] },
): Promise<PendingApproval[]> {
  const { data } = await supabase
    .from('workflow_instances')
    .select('id, definition_key, entity_type, entity_id, current_seq, created_at, initiator_id')
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
  const instances = (data ?? []) as PendingApproval[]
  if (viewer.role === 'school_owner' || instances.length === 0) return instances

  const [{ data: stages }, { data: steps }, { data: scope, error: scopeError }] = await Promise.all([
    supabase.from('workflow_stages').select('definition_key, seq, approver_role, approver_user'),
    supabase.from('workflow_steps').select('instance_id').eq('approver_id', viewer.userId),
    supabase.rpc('app_class_scope'),
  ])
  return instancesInReach(instances, (stages ?? []) as ReachStage[], {
    role: viewer.role,
    userId: viewer.userId,
    // Fails closed: an RPC error is not "office staff".
    officeAttendance: !scopeError && scope === 'school-wide' && viewer.grants.includes('attendance'),
    decided: new Set((steps ?? []).map((s) => s.instance_id as string)),
  })
}
