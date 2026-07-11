'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

// Logistics / physical-file index (issue #39, PRD §5.11).

const PAGE = '/school/institute/logistics'

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v.length ? v : null
}

export async function addLogisticsEntry(formData: FormData): Promise<{ error?: string }> {
  const itemType = str(formData, 'item_type')
  const year = str(formData, 'year')
  const storageLocation = str(formData, 'storage_location')
  if (!itemType) return { error: 'Item type is required' }
  if (!year) return { error: 'Year is required' }
  if (!storageLocation) return { error: 'Storage location is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { error } = await supabase.from('logistics_index').insert({
    item_type: itemType,
    year,
    storage_location: storageLocation,
    notes: optStr(formData, 'notes'),
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

export async function updateLogisticsEntry(id: string, formData: FormData): Promise<{ error?: string }> {
  const itemType = str(formData, 'item_type')
  const year = str(formData, 'year')
  const storageLocation = str(formData, 'storage_location')
  if (!itemType) return { error: 'Item type is required' }
  if (!year) return { error: 'Year is required' }
  if (!storageLocation) return { error: 'Storage location is required' }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('logistics_index')
    .update({
      item_type: itemType,
      year,
      storage_location: storageLocation,
      notes: optStr(formData, 'notes'),
    })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Entry not found or not accessible' }
  revalidatePath(PAGE)
  return {}
}

export async function deleteLogisticsEntry(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }
  const { error } = await supabase.from('logistics_index').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
