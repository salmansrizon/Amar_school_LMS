import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { FEATURE_KEYS } from '@/lib/auth/screens'

// The seam #515 left open on purpose.
//
// The screen keys exist twice by design: in code (the registry, which decides
// what the app routes and gates) and in the feature engine's config tables
// (0081, which decide what a given school gets and carry the labels the Super
// Admin edits). "Config over code" (AGENTS.md) governs availability; it does not
// govern which screens the product HAS, because edge middleware cannot query
// Postgres to learn what routes exist.
//
// So one copy cannot be deleted — but nothing compared them either, and the
// third copy (FEATURE_KEYS) has now been. This is what stops the remaining two
// drifting: a screen added to the registry without a feature row would silently
// never be switchable, and a feature row with no screen would be a switch over
// nothing.
describe('the screen registry and the feature seed agree (#515)', () => {
  let superClient: SupabaseClient

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
  })

  it('has one feature row per grantable screen, and no orphans', async () => {
    const { data, error } = await superClient.from('features').select('key')
    expect(error).toBeNull()

    // The project's own E2E suites insert throwaway features and never clean
    // them up; there are eight on the shared DB today. Filtering them is not
    // loosening the assertion — a key the product routes on will never be named
    // e2e_*, and asserting a bare equality here would fail on fixture debris
    // rather than on drift.
    const inDb = (data ?? [])
      .map((f) => f.key as string)
      .filter((k) => !k.startsWith('e2e_'))
      .sort()
    expect(inDb).toEqual([...FEATURE_KEYS].sort())
  })
})
