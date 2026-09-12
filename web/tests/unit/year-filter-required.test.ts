import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Global Academic Year Filtering (map #609, T5/#614/#615; extended by issue
// #621's picker sweep) — a guard against omission, mirroring
// tests/unit/shift-filter-required.test.ts's own mechanism exactly (same
// file walker, same "tail" slicing, same [file, reason] allowlist shape):
// this one watches `class_offerings` reads for composing
// applyGlobalYearFilterToOfferings/filterOfferingsByYearSelection instead of
// applyGlobalShiftFilterToOfferings. A dropdown that silently stops
// narrowing to the Global Academic Year Selection is exactly the class of
// bug this test exists to catch (found in production after #621 shipped:
// several pickers showed every year's Offerings regardless of the global
// selection).

const WATCHED_TABLES = ['class_offerings']

/** A read composes the year filter somewhere in its chain. */
const FILTERED = /applyGlobalYearFilterToOfferings\(|filterOfferingsByYearSelection\(/

/** A single, already-identified row isn't a list to narrow by year — it's
 *  scoped by its own other predicate (an id, typically) and narrowing it
 *  further would only risk hiding the very row the caller asked for by
 *  name. Same shape-recognition role SINGLE_ROW plays in the shift-filter
 *  guard, different filter. */
const SINGLE_ROW = /\.(single|maybeSingle)\(/

/** Reads exempted with a reason, not just a path — an allowlist without one
 *  becomes a place to hide things (same rule as the shift-filter guard's own
 *  EXEMPT). Every entry here was reached by reading the actual call site. */
const EXEMPT: [file: string, reason: string][] = [
  // --- dual-purpose lookups (label an OTHER already-existing entity by
  // class_id) — year-filtering would blank a legitimate existing label for
  // an Offering whose year is currently deselected, not just narrow a
  // picker. Each of these derives its own picker's options separately, in
  // memory, from this same unfiltered read (filterOfferingsByYearSelection).
  ['app/school/exams/page.tsx', 'also labels existing Exams by class_id in the same list'],
  ['app/school/exams/combinations/page.tsx', 'also labels existing Combinations by class_id in the same list'],
  ['app/school/notices/page.tsx', "labels each publication's target Offering by class_offering_id, not a picker"],
  [
    'app/school/questions/response/page.tsx',
    'attribution map (offering -> class_teacher_id) for response stats, not a picker',
  ],

  // --- targeting/compose surfaces pinned to active_academic_year by
  // business rule (map #609's locked decision, #621's own exclusion list) —
  // never narrowed by the Global Academic Year Selection.
  ['app/school/sms/page.tsx', 'compose/targeting picker: pinned to active_academic_year, not the global view filter'],
  ['app/school/sms/actions.ts', 'SMS send-time targeting: same pinned-to-active-year compose surface as sms/page.tsx'],
  ['app/school/my-classes/page.tsx', "Homework compose surface: pinned to active_academic_year (#609's locked decision)"],

  // --- already-known-id / already-loaded-set label lookups, not a list of
  // choices to narrow.
  ['app/school/exams/[id]/result-book/page.tsx', '.in(id, classIds) label lookup for already-loaded exams, not a picker'],
  ['app/school/exams/[id]/seat-plan/print/page.tsx', 'label lookup for already-determined seat-plan rooms, not a picker'],

  // --- read-only / print / count surfaces with no picker at all, nothing to
  // narrow (#621's own exclusion list; app/school/page.tsx is a schoolwide
  // count, not a class-scoped read).
  ['app/school/classes/routine/print/page.tsx', 'print artifact, no picker (#621 exclusion)'],
  ['app/school/classes/syllabus/page.tsx', 'per-row display, no picker (#621 exclusion)'],
  ['app/school/page.tsx', 'dashboard total-class count is schoolwide, no picker'],

  // --- the Shift filter's own internal implementation detail, not itself a
  // class picker.
  ['lib/school/shift-filter.ts', 'internal id-resolution read for applyGlobalShiftFilterToStudents, not a picker'],
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

describe('Global Academic Year Filtering is applied to class_offerings reads (#609/#621)', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('lib')]

  for (const table of WATCHED_TABLES) {
    it(`.from('${table}') reads compose the year filter or are exempted with a reason`, () => {
      const offenders: string[] = []

      for (const file of files) {
        const normalizedFile = file.replace(/\\/g, '/')
        const src = readFileSync(file, 'utf8')
        let at = src.indexOf(`.from('${table}')`)
        while (at !== -1) {
          const tail = src.slice(at, at + 600).split('\n\n')[0]
          const isMutation = /\.(update|insert|upsert|delete)\(/.test(tail.split('.select(')[0])
          const exempted = EXEMPT.some(([f]) => normalizedFile.endsWith(f))
          // Both helpers WRAP the query (a plain function call around
          // `supabase.from(...)`), not a chained method — so the call text
          // sits BEFORE the `.from(...)` match, same shape the shift-filter
          // guard's own FILTERED check needs.
          const surrounding = src.slice(Math.max(0, at - 400), at + 600)
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

      expect(offenders, `unfiltered read of class_offerings:\n${offenders.join('\n')}`).toEqual([])
    })
  }
})
