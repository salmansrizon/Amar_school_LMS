import type { SupabaseClient } from '@supabase/supabase-js'
import { pageRange } from '@/components/pager'
import { withLeaveColumns } from '@/lib/leave-columns'
import { LEAVE_STATUSES } from './leave-shared'

// One page of a leave table, read from the database with count + range()
// instead of loading a capped slice and cutting it in memory. Status chip
// counts are totals over the whole (search-filtered) set, not the page.

type R2 = { data: unknown; error: { code?: string; message?: string } | null }

type Opts = {
  supabase: SupabaseClient
  table: 'student_leaves' | 'employee_leaves'
  personCol: 'student_id' | 'employee_id'
  /** Restrict to these people (a search/class filter). null = no restriction. */
  ids: string[] | null
  status: string
  rawPage: string | undefined
  pageSize: number
  /** The open drawer record, fetched by id when it is not on this page. */
  viewId?: string
}

export async function leavePage<Row extends { id: string; status: string }>(o: Opts) {
  const scope = (q: any) => (o.ids ? q.in(o.personCol, o.ids) : q) // eslint-disable-line @typescript-eslint/no-explicit-any
  const count = async (status?: string) => {
    if (o.ids && !o.ids.length) return 0
    let q = scope(o.supabase.from(o.table).select('id', { count: 'exact', head: true }))
    if (status) q = q.eq('status', status)
    const { count: n } = await q
    return (n as number | null) ?? 0
  }
  const [total, ...byStatus] = await Promise.all([count(o.status || undefined), ...LEAVE_STATUSES.map((s) => count(s))])
  const statusCounts = Object.fromEntries(LEAVE_STATUSES.map((s, i) => [s, byStatus[i]])) as Record<string, number>
  const range = pageRange(o.rawPage, total, o.pageSize)

  const pageCols = `id, ${o.personCol}, from_day, to_day, reason, status`
  const read = (cols: string): PromiseLike<R2> => {
    let q = scope(o.supabase.from(o.table).select(cols))
    if (o.status) q = q.eq('status', o.status)
    return q
      .order(o.ids ? 'from_day' : 'created_at', { ascending: false })
      .order('id')
      .range(range.from, range.to)
  }
  let rows: Row[] = []
  if (total > 0) {
    const { data } = await withLeaveColumns(() => read(`${pageCols}, decision_note, decided_at`), () => read(pageCols))
    rows = (data ?? []) as unknown as Row[]
  }
  let viewed = o.viewId ? rows.find((r) => r.id === o.viewId) : undefined
  if (o.viewId && !viewed) {
    const one = (cols: string): PromiseLike<R2> => o.supabase.from(o.table).select(cols).eq('id', o.viewId!).maybeSingle()
    const { data } = await withLeaveColumns(() => one(`${pageCols}, decision_note, decided_at`), () => one(pageCols))
    viewed = (data ?? undefined) as unknown as Row | undefined
  }
  return { rows, viewed, statusCounts, ...range }
}
