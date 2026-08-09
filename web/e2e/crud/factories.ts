import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../../tests/helpers/auth'

// Deep-CRUD factory foundation (map #329, ticket #358). FK-chained school modules
// (exam needs a class + students, a fee payment needs a student + fee structure)
// build their preconditions here rather than from a shared seeded baseline —
// each spec creates its own chain and tears it down, so runs stay isolated and
// rerun-safe. Writes go through an owner supabase client (RLS: "school members
// manage <table>"; school_id defaults to app_current_school_id()).
//
// Start with the reusable core (class, student); module tickets (#359–#364)
// extend it (exam, fee structure, …) as they land, composing these.

export interface Made {
  id: string
  /** Delete the row (and, by FK cascade, anything built on it). */
  cleanup: () => Promise<void>
}

let unique = 0
const stamp = () => `${Date.now()}-${unique++}`

/** An owner-authenticated client for the seeded Test School A. */
export function ownerClient(): Promise<SupabaseClient> {
  return signedIn('owner-a@test.local')
}

export async function createClass(
  owner: SupabaseClient,
  opts: { name?: string; section?: string } = {},
): Promise<Made & { name: string; section: string }> {
  const name = opts.name ?? `E2E Class ${stamp()}`
  const section = opts.section ?? 'A'
  const { data, error } = await owner.from('classes').insert({ name, section }).select('id').single()
  if (error) throw new Error(`createClass failed: ${error.message}`)
  const id = data!.id as string
  return { id, name, section, cleanup: async () => void (await owner.from('classes').delete().eq('id', id)) }
}

export async function createStudent(
  owner: SupabaseClient,
  opts: { name?: string; className?: string; section?: string } = {},
): Promise<Made & { name: string }> {
  const name = opts.name ?? `E2E Student ${stamp()}`
  const { data, error } = await owner
    .from('students')
    .insert({ full_name: name, class_name: opts.className ?? null, section: opts.section ?? null })
    .select('id')
    .single()
  if (error) throw new Error(`createStudent failed: ${error.message}`)
  const id = data!.id as string
  return { id, name, cleanup: async () => void (await owner.from('students').delete().eq('id', id)) }
}
