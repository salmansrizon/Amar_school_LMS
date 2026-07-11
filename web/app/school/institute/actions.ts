'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolOwner } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { validateInstituteProfile, type InstituteProfileInput } from '@/lib/institute'

// Institute profile (issue #39, PRD §5.11) — owner-only (RLS "owner updates
// own school" + requireSchoolOwner belt-and-suspenders here).

const PAGE = '/school/institute'

function optStr(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? '').trim()
  return v.length ? v : null
}

export async function updateInstituteProfile(formData: FormData): Promise<{ error?: string }> {
  const input: InstituteProfileInput = {
    name: String(formData.get('name') ?? '').trim(),
    institute_code: optStr(formData, 'institute_code'),
    eiin_no: optStr(formData, 'eiin_no'),
    mpo_enlisted: formData.get('mpo_enlisted') === 'true',
    mpo_code: optStr(formData, 'mpo_code'),
    center_code: optStr(formData, 'center_code'),
    education_levels: formData.getAll('education_levels').map(String),
  }
  const err = validateInstituteProfile(input)
  if (err) return { error: err }

  const supabase = await createClient()
  if (!(await requireSchoolOwner(supabase))) return { error: 'Unauthorized' }

  const locationId = optStr(formData, 'location_id')
  const clusterId = optStr(formData, 'cluster_id')

  const { data: userRes } = await supabase.auth.getUser()
  const { data: me } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', userRes.user!.id)
    .single()
  if (!me?.school_id) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('schools')
    .update({
      name: input.name,
      institute_code: input.institute_code,
      eiin_no: input.eiin_no,
      mpo_enlisted: input.mpo_enlisted,
      mpo_code: input.mpo_code,
      center_code: input.center_code,
      education_levels: input.education_levels,
      location_id: locationId,
      cluster_id: clusterId,
    })
    .eq('id', me.school_id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}
