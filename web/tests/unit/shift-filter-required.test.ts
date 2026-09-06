import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Global Shift Filtering (issue #579, Wave 5/#590): a guard against
// omission, mirroring tests/unit/unbounded-growth-reads.test.ts's own
// mechanism exactly (same file walker, same "tail" slicing, same
// [file, reason] allowlist shape) — this one watches `class_offerings` and
// `students` reads instead of growth-table reads, and "bounded" means
// composing applyGlobalShiftFilterToOfferings/ToStudents instead of
// .range()/.limit().

const WATCHED_TABLES = ['class_offerings', 'students']

/** A read composes the shift filter somewhere in its chain. */
const FILTERED = /applyGlobalShiftFilterToOfferings\(|applyGlobalShiftFilterToStudents\(/

/** A single, already-identified row isn't a list to narrow by Shift — it's
 *  scoped by its own other predicate (an id, typically) and narrowing it
 *  further by Shift would only risk hiding the very row the caller asked
 *  for by name. Same shape-recognition role BOUNDED plays in the growth-
 *  reads test, different shape. */
const SINGLE_ROW = /\.(single|maybeSingle)\(/

/** Reads exempted with a reason, not just a path — an allowlist without one
 *  becomes a place to hide things (same rule as BOUNDED_BY_SCOPE). Every
 *  entry here was reached by reading the actual call site, not guessed from
 *  its name — see the Wave 5 (#590) resolution comment on GitHub for the
 *  full per-site reasoning this summarizes. */
const EXEMPT: [file: string, reason: string][] = [
  // --- class_offerings: dual-purpose lookups (label an OTHER already-
  // existing entity by class_id) — filtering would blank legitimate
  // existing labels for off-shift classes, not just narrow a picker.
  ['app/school/exams/combinations/page.tsx', 'also labels existing Combinations by class_id in the same list'],
  ['app/school/exams/page.tsx', 'also labels existing Exams by class_id in the same list'],
  [
    'app/school/questions/response/page.tsx',
    'attribution map (offering -> class_teacher_id) for response stats, not a picker',
  ],
  // --- class_offerings: persisted-value / already-known-id lookups, not a
  // list of choices to narrow.
  ['app/school/exams/[id]/page.tsx', "this exam's own already-set class_id could be orphaned from the picker"],
  ['app/school/exams/[id]/result-book/page.tsx', '.in(id, classIds) label lookup for already-loaded exams, not a picker'],
  ['app/school/exams/[id]/seat-plan/print/page.tsx', 'label lookup for already-determined seat-plan rooms, not a picker'],

  // --- students: still resolved via the legacy class_name/section text
  // bridge (map #568/#582) — cannot reach class_offerings.shift without
  // first switching to an enrollment join, which is the exact premature-
  // cutover trap this whole migration has avoided elsewhere (Wave 4a's
  // roster-source.ts deferral, Wave 4c's SMS-targeting deferral). Genuinely
  // Wave 6's territory, once current_enrollment_id is backfilled.
  ['lib/exam-print-data.ts', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/admit-cards/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/attendance-sheet/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/cocurricular/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/marks-entry/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/print-all/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/printables/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/exams/[id]/seat-plan/page.tsx', 'legacy class_name/section text bridge — blocked on Wave 6 backfill'],
  ['app/school/students/login-actions.ts', 'classLoginCandidates: legacy class_name/section text bridge'],
  [
    'app/school/sms/actions.ts',
    'SMS send-time targeting: legacy text bridge, deferred with Notices targeting (map #582)',
  ],
  ['app/school/sms/page.tsx', 'SMS class picker built from the same deferred legacy-bridge targeting'],

  // --- students: already scoped to one specific, already-resolved id set —
  // not a list of choices to narrow further.
  [
    'app/school/exams/[id]/promotion/page.tsx',
    ".in(id, enrolledIds) — already the enrolled roster of ONE chosen Offering",
  ],

  // --- students: no class dimension exists on these reads at all today —
  // adding Shift narrowing here means inventing a new join, not composing
  // an existing filter. Candidate follow-up, not this wave's scope.
  ['app/api/school/recent-activity/route.ts', 'recent-admissions feed has no class dimension today'],
  ['app/school/activity/page.tsx', 'recent-admissions feed has no class dimension today'],
  ['app/school/attendance/leave/page.tsx', "leave list's student-name lookup has no class filter today"],
  ['app/school/page.tsx', 'dashboard total-student count is schoolwide, no class dimension'],
  ['app/school/sms/rules/page.tsx', 'student picker here has no class/section dimension at all'],
  ['lib/search/actions.ts', 'global search has no class dimension today'],

  // --- students: deliberately not shift-narrowed.
  ['app/school/students/archive/page.tsx', 'archived roster is a historical view, deliberately unfiltered'],

  // --- students: cross-School aggregate — no single institute's Shift
  // configuration applies to a super-admin, cross-tenant count.
  ['lib/super-admin/schools-read-model.ts', 'cross-School super-admin aggregate, no single institute context'],
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

describe('Global Shift Filtering is applied to class_offerings/students reads (#579)', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('lib')]

  for (const table of WATCHED_TABLES) {
    it(`.from('${table}') reads compose the shift filter or are exempted with a reason`, () => {
      const offenders: string[] = []

      for (const file of files) {
        // Normalized once per file: EXEMPT is written with forward slashes
        // for readability, but `join()` produces the platform separator —
        // backslash on Windows, where a bare `endsWith` against a
        // forward-slash path never matches (silently exempting nothing,
        // not erroring) — the same latent bug unbounded-growth-reads.test.ts's
        // own BOUNDED_BY_SCOPE has, worth fixing here rather than repeating.
        const normalizedFile = file.replace(/\\/g, '/')
        const src = readFileSync(file, 'utf8')
        let at = src.indexOf(`.from('${table}')`)
        while (at !== -1) {
          const tail = src.slice(at, at + 600).split('\n\n')[0]
          const isMutation = /\.(update|insert|upsert|delete)\(/.test(tail.split('.select(')[0])
          const exempted = EXEMPT.some(([f]) => normalizedFile.endsWith(f))
          // The two shift-filter helpers are plain function calls that WRAP
          // the query (`applyGlobalShiftFilterToOfferings(supabase.from(...)
          // ..., selection)`), not chained methods like `.range()` — so the
          // call text sits BEFORE the `.from(...)` match, not after it. A
          // surrounding window (some chars back, same 600 forward) is what
          // this shape actually needs, unlike the growth-reads test's
          // purely-forward BOUNDED check.
          const surrounding = src.slice(Math.max(0, at - 300), at + 600)
          if (
            tail.includes('.select(') &&
            !isMutation &&
            !exempted &&
            !SINGLE_ROW.test(tail) &&
            !FILTERED.test(surrounding)
          ) {
            offenders.push(`${file}: ${tail.split('\n').slice(0, 2).join(' ').trim()}`)
          }
          at = src.indexOf(`.from('${table}')`, at + 1)
        }
      }

      expect(offenders, `unfiltered read of a shift-bearing table:\n${offenders.join('\n')}`).toEqual([])
    })
  }
})
