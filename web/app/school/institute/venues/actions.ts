'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateBuilding, validateRoom, type BuildingRow, type RoomRow } from '@/lib/venues'

// Venues master data (issue #93, map #91, docs/improvement.md §2A). RLS scopes
// every read and write to the caller's own School; migration 0057's
// constraints (unique building name per school, unique room name per building,
// composite same-school FK) are the real authority — validation here just
// turns them into a translated message before the round trip.

const PAGE = '/school/institute/venues'

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

async function venueState() {
  const supabase = await createClient()
  const [{ data: buildings }, { data: rooms }] = await Promise.all([
    supabase.from('buildings').select('id, name').order('name'),
    supabase.from('rooms').select('id, building_id, name, capacity, is_active'),
  ])
  return {
    supabase,
    buildings: (buildings ?? []) as BuildingRow[],
    rooms: (rooms ?? []) as RoomRow[],
  }
}

export async function saveBuilding(formData: FormData): Promise<{ error?: string }> {
  const id = str(formData, 'id') || undefined
  const name = str(formData, 'name')
  const { supabase, buildings } = await venueState()
  const err = validateBuilding({ name, id }, buildings)
  if (err) return { error: err }

  const { error } = id
    ? await supabase.from('buildings').update({ name }).eq('id', id)
    : await supabase.from('buildings').insert({ name })
  if (error) return { error: error.code === '23505' ? 'buildingNameDuplicate' : error.message }
  revalidatePath(PAGE)
  return {}
}

/** Deleting a building cascades to its rooms (0057's FK) — the UI confirms
 *  with the room count first, since that is real master data going away. */
export async function deleteBuilding(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('buildings').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Building not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}

export async function saveRoom(formData: FormData): Promise<{ error?: string }> {
  const id = str(formData, 'id') || undefined
  const name = str(formData, 'name')
  const buildingId = str(formData, 'building_id')
  const capacity = Number(formData.get('capacity'))
  const isActive = formData.get('is_active') !== 'false'

  const { supabase, rooms } = await venueState()
  const err = validateRoom({ name, capacity, building_id: buildingId, id }, rooms)
  if (err) return { error: err }

  const row = { name, capacity, building_id: buildingId, is_active: isActive }
  const { error } = id
    ? await supabase.from('rooms').update(row).eq('id', id)
    : await supabase.from('rooms').insert(row)
  if (error) return { error: error.code === '23505' ? 'roomNameDuplicate' : error.message }
  revalidatePath(PAGE)
  return {}
}

export async function deleteRoom(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('rooms').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Room not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}
