import { describe, expect, it } from 'vitest'
import { classScopeFor } from '@/lib/school/class-scope'
import type { SupabaseClient } from '@supabase/supabase-js'

// #525 / migration 0160: the row set is decided in RLS, but the *sentence* the
// screen shows depends on why it came back empty. Office staff seeing nothing is
// a genuinely empty school; an Employee seeing nothing has no class attachment.
function stub({ employee, classes = 0, slots = 0 }: { employee: boolean; classes?: number; slots?: number }) {
  return {
    from(table: string) {
      if (table === 'employees') {
        return {
          select: () => ({
            eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: employee ? { id: 'emp-1' } : null }) }) }),
          }),
        }
      }
      const count = table === 'classes' ? classes : slots
      return { select: () => ({ eq: async () => ({ count }) }) }
    },
  } as unknown as SupabaseClient
}

describe('classScopeFor', () => {
  it('treats a staff login with no employees row as office staff, who keep the school', async () => {
    expect(await classScopeFor(stub({ employee: false }), 'u1')).toBe('school-wide')
  })

  it('reports a class teacher as attached', async () => {
    expect(await classScopeFor(stub({ employee: true, classes: 1 }), 'u1')).toBe('attached')
  })

  it('reports a subject teacher — routine slots only — as attached', async () => {
    expect(await classScopeFor(stub({ employee: true, slots: 3 }), 'u1')).toBe('attached')
  })

  // The case the whole helper exists for: an Employee the Owner created but never
  // assigned. RLS gives them nothing, and the screen must say why.
  it('reports an employee with neither attachment as unassigned', async () => {
    expect(await classScopeFor(stub({ employee: true }), 'u1')).toBe('none')
  })
})
