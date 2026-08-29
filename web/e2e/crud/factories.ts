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

// Everything a spec has built in this run, newest first.
//
// cleanup() alone was not enough (#541). It is opt-in, and a spec that fails
// mid-test never reaches the call at the end of its body — so exactly the runs
// that go wrong are the ones that leak. 61 orphaned `E2E …` students had built up
// on the shared database that way, and because students carry class_name as TEXT
// rather than a foreign key, deleting the class left the students behind pointing
// at a name that no longer existed: 39 phantom class/section combinations in the
// fixture school's own student list.
//
// Registered here and drained from afterEach, so a failing spec cleans up too.
const made: (() => Promise<void>)[] = []

function register(cleanup: () => Promise<void>): () => Promise<void> {
  made.unshift(cleanup)
  return cleanup
}

/** Drop everything this run created, newest first. Call from `test.afterEach`.
 *
 *  Reverse order matters: a class is deleted after the students that name it, or
 *  the students are orphaned rather than removed. */
export async function cleanupAll(): Promise<void> {
  const pending = made.splice(0, made.length)
  for (const cleanup of pending) {
    // One failure must not strand the rest — a spec that already deleted its own
    // row is the common case, not an error.
    await cleanup().catch(() => {})
  }
}

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
  return {
    id,
    name,
    section,
    cleanup: register(async () => void (await owner.from('classes').delete().eq('id', id))),
  }
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
  return {
    id,
    name,
    cleanup: register(async () => void (await owner.from('students').delete().eq('id', id))),
  }
}
