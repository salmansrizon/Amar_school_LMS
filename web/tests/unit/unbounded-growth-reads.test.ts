import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// #546 / #530: PostgREST caps an unbounded select at 1000 rows silently. On a
// reference table that is harmless — a school has forty classes, not a thousand.
// On a table that grows with usage it is not, because the short array is folded
// into a number nobody can tell is wrong.
//
// So this guards the growth tables by name rather than banning unbounded selects
// everywhere: a blanket rule over ~270 call sites would be noise, and noise gets
// suppressed. These are the tables whose row count rises with every exam, every
// school day, every payment.
const GROWTH_TABLES = [
  'exam_marks',
  'attendance_records',
  'payments',
  'commissions',
  'wallet_ledger_entries',
  'subscription_codes',
  'gl_lines',
  'fee_collection_records',
  'domain_events',
  'audit_log',
]

/** Ways a read is legitimately bounded. */
const BOUNDED = /\.(range|limit|single|maybeSingle)\(|head:\s*true|count:\s*'exact'/

/** Reads on a growth table that cannot grow past the cap, because a filter pins
 *  them to one entity. Each needs the reason, not just the path — an allowlist
 *  without one becomes a place to hide things. */
const BOUNDED_BY_SCOPE: [file: string, reason: string][] = [
  ['app/school/attendance/employee/page.tsx', 'one date: at most one row per employee'],
  ['app/school/attendance/mark/page.tsx', 'one class and one date'],
  ['app/school/attendance/student-log/[studentId]/page.tsx', 'one student, one date range'],
  ['app/student/attendance/page.tsx', 'the signed-in student, one term'],
  ['app/distributor/invoices/[id]/page.tsx', 'the payments of one invoice'],
  ['app/school/fees/page.tsx', 'one class roster in one month'],
]

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('growth tables are never read unbounded (#546)', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('lib')]

  for (const table of GROWTH_TABLES) {
    it(`${table} is always bounded or aggregated`, () => {
      const offenders: string[] = []

      for (const file of files) {
        const src = readFileSync(file, 'utf8')
        let at = src.indexOf(`.from('${table}')`)
        while (at !== -1) {
          // The chained statement: everything up to the first blank line or the
          // next `.from(`, which is enough to see how this read is bounded.
          const tail = src.slice(at, at + 600).split('\n\n')[0]
          // A mutation chain often ends `.select()` to return the affected row;
          // that is not a read of the table and cannot be truncated into a wrong
          // total.
          const isMutation = /\.(update|insert|upsert|delete)\(/.test(tail.split('.select(')[0])
          const scoped = BOUNDED_BY_SCOPE.some(([f]) => file.endsWith(f))
          if (tail.includes('.select(') && !isMutation && !scoped && !BOUNDED.test(tail)) {
            offenders.push(`${file}: ${tail.split('\n').slice(0, 2).join(' ').trim()}`)
          }
          at = src.indexOf(`.from('${table}')`, at + 1)
        }
      }

      expect(offenders, `unbounded read of a growth table:\n${offenders.join('\n')}`).toEqual([])
    })
  }
})
