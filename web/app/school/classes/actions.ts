'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isKnownAcademicShift, isBuiltInGroupDepartment } from '@/lib/institute'
import { classOfferingIsUsed } from '@/lib/school/class-offering-usage'

// RLS ("school members manage …" scoped to app_current_school_id()) is the
// authority on every write here — these actions only validate + shape input.

const PAGE = '/school/classes'

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v.length ? v : null
}

/** Creates a Class Offering (renamed from `classes`, map #568/#582's Wave 3,
 *  issue #586). academic_year defaults to the School's active_academic_year
 *  (issue #570) when set — a School with no active year yet (pre-Wave-6)
 *  simply creates one with a null academic_year, same as this column's own
 *  nullable-until-backfilled state. Shift (issue #578, Wave 5/#590) is
 *  optional and stays null for a No-Shift School, or a School that leaves it
 *  unset — `class_offerings.shift` is nullable permanently, not just until
 *  some later backfill. The submitted value is re-validated against the
 *  fixed vocabulary server-side (never just trusted from the picker) — the
 *  picker's own *narrower* choice-filtering (configured ∩ Global Selection,
 *  #578 Q7-8) is a UX restriction, not a security boundary, so a value
 *  outside the current picker but still in the fixed vocabulary is accepted,
 *  matching #578's explicit resolution of that exact case. */
export async function addClass(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const shift = optStr(formData, 'shift')
  if (shift && !isKnownAcademicShift(shift)) return { error: 'Invalid Shift' }
  const educationLevel = optStr(formData, 'education_level')
  const groupDepartment = optStr(formData, 'group_department')
  const supabase = await createClient()
  // Scoped to the caller's own School explicitly: an unfiltered maybeSingle()
  // returns nothing (and silently drops academic_year) for any caller who can
  // see more than one schools row.
  const { data: schoolId } = await supabase.rpc('app_current_school_id')
  const { data: school } = await supabase
    .from('schools')
    .select('active_academic_year, education_levels')
    .eq('id', schoolId)
    .maybeSingle()
  // Education Level (issue #633): the picker only ever offers the School's
  // own configured set, but re-validate here too rather than trust it blindly
  // — unlike Shift, there is no broader fixed vocabulary to fall back to, so
  // a value outside the School's configured set is simply invalid.
  if (educationLevel && !(school?.education_levels ?? []).includes(educationLevel)) {
    return { error: 'Invalid Education Level' }
  }
  const { error } = await supabase.from('class_offerings').insert({
    name,
    section: optStr(formData, 'section'),
    education_level: educationLevel,
    group_department: groupDepartment,
    class_teacher_id: optStr(formData, 'class_teacher_id'),
    academic_year: school?.active_academic_year ?? null,
    shift,
  })
  if (error) {
    if (error.code === '23505') return { error: 'This class + section already exists' }
    return { error: error.message }
  }
  // Group/Department Other (issue #635, ADR 0025): a School-typed value that
  // isn't one of the three built-ins is remembered for this School's future
  // Add Class dropdowns. Only after the class itself saved successfully.
  // school_group_department_options' unique index is case-insensitive per
  // school, so a value that already exists (in any casing) just no-ops here
  // (23505) rather than erroring the whole save — the class was already created.
  if (groupDepartment && !isBuiltInGroupDepartment(groupDepartment)) {
    const { error: optionError } = await supabase
      .from('school_group_department_options')
      .insert({ name: groupDepartment })
    if (optionError && optionError.code !== '23505') return { error: optionError.message }
  }
  revalidatePath(PAGE)
  return {}
}

/** Assign or clear a Class Offering's Class Teacher (#443). Separate from addClass
 *  because there is no class edit form — this is how existing classes, and the
 *  ones a school created before this shipped, get one. */
export async function setClassTeacher(
  classId: string,
  employeeId: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_offerings')
    .update({ class_teacher_id: employeeId })
    .eq('id', classId)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Class not found' }
  revalidatePath(PAGE)
  return {}
}

/** "Copy Classes from {year}" (map #609, T8/#617) — a thin wrapper over the
 *  `copy_class_offerings_to_active_year` RPC (T7/#616), which owns every
 *  authorization (School Owner only), validation (source is a started year
 *  older than the active one), duplicate and concurrency guarantee. This
 *  action shapes the input year and surfaces the RPC's own error string; it
 *  does no client-side dedupe. Idempotent because the RPC is: a re-run just
 *  reports the same rows as `skipped`. */
export async function copyClassesFromYear(
  sourceYear: number,
): Promise<{ copied: number; skipped: number } | { error: string }> {
  if (!Number.isInteger(sourceYear)) return { error: 'Invalid source year' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('copy_class_offerings_to_active_year', {
    p_source_year: sourceYear,
  })
  if (error) return { error: error.message }
  // `returns table(copied int, skipped int)` arrives as a one-row array.
  const row = Array.isArray(data) ? data[0] : data
  revalidatePath(PAGE)
  return { copied: Number(row?.copied ?? 0), skipped: Number(row?.skipped ?? 0) }
}

/** Subject List's "Copy to Class" bulk action (issue #642) -- duplicates the
 *  given Subjects onto one other Class Offering. All the validation
 *  (target must be this School's, non-archived; conflicts skipped rather
 *  than overwritten) lives in the `copy_subjects_to_class` RPC (0204), same
 *  split as `copyClassesFromYear` below. */
export async function copySubjectsToClass(
  subjectIds: string[],
  targetClassId: string,
): Promise<{ copied: number; skipped: number } | { error: string }> {
  if (!subjectIds.length) return { error: 'No subjects selected' }
  if (!targetClassId) return { error: 'Target class is required' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('copy_subjects_to_class', {
    p_subject_ids: subjectIds,
    p_target_class_id: targetClassId,
  })
  if (error) return { error: error.message }
  // `returns table(copied int, skipped int)` arrives as a one-row array.
  const row = Array.isArray(data) ? data[0] : data
  revalidatePath(PAGE)
  return { copied: Number(row?.copied ?? 0), skipped: Number(row?.skipped ?? 0) }
}

export async function addSubject(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const classId = str(formData, 'class_id')
  if (!classId) return { error: 'Class is required' }
  const theory = Number(formData.get('theory_marks') || 0)
  const mcq = Number(formData.get('mcq_marks') || 0)
  const practical = Number(formData.get('practical_marks') || 0)
  const papers = Number(formData.get('paper_count') || 1)
  for (const [label, v] of [
    ['Theory', theory],
    ['MCQ', mcq],
    ['Practical', practical],
  ] as const) {
    if (!Number.isInteger(v) || v < 0)
      return { error: `${label} marks must be zero or a positive whole number` }
  }
  if (theory + mcq + practical <= 0)
    return { error: 'A subject needs marks in at least one component' }
  if (!Number.isInteger(papers) || papers < 1 || papers > 4)
    return { error: 'Papers must be between 1 and 4' }
  const supabase = await createClient()
  const { error } = await supabase.from('subjects').insert({
    class_id: classId,
    name,
    code: optStr(formData, 'code'),
    theory_marks: theory,
    mcq_marks: mcq,
    practical_marks: practical,
    paper_count: papers,
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

// Rooms are no longer deleted from here — they moved to Institute Setup ->
// Venues with issue #93, where deletion goes through the building they belong to.
type Entity = 'class_offerings' | 'subjects'
const ENTITIES: ReadonlySet<Entity> = new Set(['class_offerings', 'subjects'])

export async function removeItem(entity: Entity, id: string): Promise<{ error?: string }> {
  if (!ENTITIES.has(entity)) return { error: 'Unknown item type' }
  const supabase = await createClient()
  if (entity === 'class_offerings') {
    // Defense-in-depth (ADR 0024): the UI only ever offers Delete for a
    // fresh (never-used) Class Offering, but re-check here too — a used
    // Offering must never be force-deleted, and the raw FK-violation error
    // this would otherwise surface (student_enrollments_class_offering_id_fkey)
    // is not a message an operator can act on.
    if (await classOfferingIsUsed(supabase, id)) {
      return { error: 'This class has been used — archive it instead of deleting.' }
    }
  }
  const { data, error } = await supabase.from(entity).delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}

/** Old Classes soft-archive (ADR 0024) — every subject, fee structure,
 *  routine slot, exam, publication target and enrollment history pointing at
 *  this Class Offering is untouched; only its availability for NEW picks
 *  changes (see `excludeArchivedOfferings`). Reversible via `restoreClassOffering`. */
export async function archiveClassOffering(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_offerings')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Class not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/archive`)
  return {}
}

export async function restoreClassOffering(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_offerings')
    .update({ archived_at: null })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Class not found' }
  revalidatePath(PAGE)
  revalidatePath(`${PAGE}/archive`)
  return {}
}
