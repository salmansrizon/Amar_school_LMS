# Global Academic Year Selection narrows Student rosters, not just Offering pickers

**Status**: accepted

Map #609 defined the Global Academic Year Selection as a pure browse/management view filter — it narrowed which Class Offerings appeared in pickers and lists, but was explicitly documented as "never an authorization mechanism," and never touched the underlying Student roster. Issue #621's follow-up sweep found that Students List, Mark Attendance, Attendance Book and the Student Log finder all read the Student roster independently of the Offering picker, so a Student enrolled in a deselected year's Offering still showed under "All Classes" on every one of those four screens — the picker narrowed, but the roster it fed didn't.

Grilled explicitly against the alternative: narrow only pure-browse screens (Students List, Student Log finder) and leave Mark Attendance / Attendance Book unfiltered, so an operational, write-oriented action could never be blocked by a view preference. The school owner (Mahbubur Rahman Khan) rejected that split and chose full narrowing everywhere: for these four screens, "All Classes" now means "all classes in the selected years," full stop, on all four including Mark Attendance and Attendance Book.

## Considered options

- **A — No change.** Keep the documented picker-only scope; the four screens' rosters stay unfiltered. Rejected: doesn't match what the product should do — an intentionally deselected year's Students shouldn't turn up as "current" everywhere.
- **B — Full narrowing everywhere (chosen).** All four screens' rosters narrow to the selection, no exceptions.
- **C — Split by purpose.** Only pure-browse screens narrow; Mark Attendance / Attendance Book stay unfiltered to avoid the promotion-lag trap below. Rejected explicitly by the school owner.

## Consequences

- **Accepted, not a bug**: right after a School advances `active_academic_year`, a Student not yet manually Promoted still has their current Enrollment in the PRIOR year's Offering. If that prior year is then deselected, the Student temporarily disappears from all four screens — including Mark Attendance — until either that year is reselected or the Student is Promoted. `active_academic_year` itself never moves and Promotion is unaffected; only visibility on these four screens changes.
- An unplaced Student (`current_enrollment_id is null`) always passes through regardless of selection — there is no year to test against, the same null-always-passes rule this codebase already applies to Shift and to Offering rows.
- Implemented as `applyGlobalYearFilterToStudents` (`lib/school/year-filter.ts`), mirroring the already-built (previously unused) `applyGlobalShiftFilterToStudents` shape: resolve matching Offerings, then matching open Enrollments, then filter `students.current_enrollment_id` — composed at the database level, not a post-fetch/in-memory filter, so search and every other roster-derived view inherit the narrowing automatically with no separate bypass logic.
- This is a genuine divergence from how Global Shift Selection behaves on the same four screens (Shift narrows the picker only, never the roster) — the two dimensions are no longer symmetric by design, not by oversight.
