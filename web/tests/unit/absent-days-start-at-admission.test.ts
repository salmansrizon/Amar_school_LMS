import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// #703 item 4.8, migration 0259. No TypeScript computes an absent working day
// (lib/fees.ts: the rule lives once, in is_absent_working_day), so there is no
// pure function to test. This pins the text of the migration: the 0218 body is
// kept, one clause is added, and the privileges 0245 revoked are not given back.

const read = (name: string) => readFileSync(join(__dirname, '../../supabase/migrations', name), 'utf8')
const code = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
const body = (sql: string) => {
  const from = sql.indexOf('create or replace function public.is_absent_working_day')
  return sql.slice(from, sql.indexOf('$$;', from)).replace(/\s+/g, ' ').trim()
}

const m0259 = code(read('0259_absent_days_start_at_admission.sql'))
const before = body(code(read('0218_absent_day_skips_weekly_off_days.sql')))
const after = body(m0259)

describe('migration 0259: absent days start at admission', () => {
  it('keeps every condition of the 0218 body, in order', () => {
    expect(after.startsWith(before)).toBe(true)
  })

  it('adds exactly one clause: not absent before the admission day, for a Student with a current Enrollment', () => {
    expect(after.slice(before.length).trim()).toBe(
      'and not exists ( select 1 from students s where s.id = sid and s.current_enrollment_id is not null ' +
        "and d < (s.created_at at time zone 'Asia/Dhaka')::date )",
    )
  })

  it('dates the day the way 0217 dates its window', () => {
    expect(read('0217_student_attendance_summary.sql')).toContain("at time zone 'Asia/Dhaka')::date")
  })

  it('replaces only that function, and grants nothing back (0245)', () => {
    expect(m0259.match(/create or replace function/g)).toHaveLength(1)
    expect(m0259).not.toMatch(/\b(grant|revoke|insert into|update |delete from|alter table|drop )\b/i)
    expect(m0259).toContain('language sql stable security definer set search_path = public')
    expect(m0259.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('carries the 0218 body as its rollback', () => {
    const rollback = read('0259_absent_days_start_at_admission.sql')
      .split('\n')
      .filter((l) => l.startsWith('--   '))
      .map((l) => l.slice(5))
      .join('\n')
    expect(body(rollback.slice(rollback.lastIndexOf('create or replace function public.is_absent_working_day')))).toBe(before)
  })
})
