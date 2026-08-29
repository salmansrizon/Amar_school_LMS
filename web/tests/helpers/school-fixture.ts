import type { SupabaseClient } from '@supabase/supabase-js'

/** Create a school for a test and remember it, so afterAll can drop it.
 *
 *  Four integration files used to insert `ZZ …` schools and clean up only the
 *  codes they minted, never the school row. 48 of them accumulated on the shared
 *  database, and because the billing sweep runs over every school, they went on
 *  collecting invoices and GL entries for weeks after the test that made them had
 *  finished — 292 invoices in the end, which is why they could not simply be
 *  deleted later (#541, ADR 0012 makes an issued document immutable).
 *
 *  Dropping the school in the same run avoids the whole problem: nothing sweeps a
 *  school that no longer exists, so no immutable document is ever created to be
 *  stuck with. */
export function schoolFixtures(admin: () => SupabaseClient) {
  const ids: string[] = []

  return {
    /** Insert a school and register it for teardown. */
    async create(fields: { name: string; subdomain?: string }): Promise<string> {
      const { data, error } = await admin().from('schools').insert(fields).select('id').single()
      if (error) throw new Error(error.message)
      ids.push(data.id)
      return data.id
    },

    /** Register a school this test created some other way. */
    track(id: string | null | undefined) {
      if (id) ids.push(id)
      return id
    },

    /** Drop every school this test made. Safe to call when none were made. */
    async cleanup() {
      if (!ids.length) return
      await admin().from('schools').delete().in('id', ids)
      ids.length = 0
    },
  }
}
