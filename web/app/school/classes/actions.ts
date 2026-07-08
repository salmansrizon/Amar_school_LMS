'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

export async function addClass(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { error } = await supabase.from('classes').insert({
    name,
    section: optStr(formData, 'section'),
    education_level: optStr(formData, 'education_level'),
    group_department: optStr(formData, 'group_department'),
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function addRoom(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const capacity = Number(formData.get('capacity'))
  if (!Number.isInteger(capacity) || capacity < 1) return { error: 'Capacity must be a positive whole number' }
  const supabase = await createClient()
  const { error } = await supabase.from('rooms').insert({ name, capacity })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function addSubject(formData: FormData): Promise<{ error?: string }> {
  const name = str(formData, 'name')
  if (!name) return { error: 'Name is required' }
  const theory = Number(formData.get('theory_marks') ?? 0)
  const mcq = Number(formData.get('mcq_marks') ?? 0)
  const practical = Number(formData.get('practical_marks') ?? 0)
  const papers = Number(formData.get('paper_count') ?? 1)
  for (const [label, v] of [
    ['Theory', theory],
    ['MCQ', mcq],
    ['Practical', practical],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) return { error: `${label} marks must be zero or a positive whole number` }
  }
  if (theory + mcq + practical <= 0) return { error: 'A subject needs marks in at least one component' }
  if (!Number.isInteger(papers) || papers < 1 || papers > 4) return { error: 'Papers must be between 1 and 4' }
  const supabase = await createClient()
  const { error } = await supabase.from('subjects').insert({
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

type Entity = 'classes' | 'rooms' | 'subjects'
const ENTITIES: ReadonlySet<Entity> = new Set(['classes', 'rooms', 'subjects'])

export async function removeItem(entity: Entity, id: string): Promise<{ error?: string }> {
  if (!ENTITIES.has(entity)) return { error: 'Unknown item type' }
  const supabase = await createClient()
  const { data, error } = await supabase.from(entity).delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}
