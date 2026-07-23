'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolOwner } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { validateInstituteProfile, type InstituteProfileInput } from '@/lib/institute'
import { logoImageExtension } from '@/lib/institute-print'

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
    address_line: optStr(formData, 'address_line'),
    mobile: optStr(formData, 'mobile'),
    email: optStr(formData, 'email'),
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
      address_line: input.address_line ?? null,
      mobile: input.mobile ?? null,
      email: input.email ?? null,
    })
    .eq('id', me.school_id)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** The deterministic object path the owner's browser uploads the logo to
 *  (issue #92) — mirrors galleryUploadPath: the server owns the path, the
 *  client owns the bytes. One object per School, replaced in place. */
export async function schoolLogoUploadPath(
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  const ext = logoImageExtension(mimeType)
  if (!ext) return { error: 'logoBadType' }
  const supabase = await createClient()
  if (!(await requireSchoolOwner(supabase))) return { error: 'Unauthorized' }
  const { data: userRes } = await supabase.auth.getUser()
  const { data: me } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', userRes.user!.id)
    .single()
  if (!me?.school_id) return { error: 'Unauthorized' }
  return { path: `${me.school_id}/logo.${ext}` }
}

/** Records the uploaded object on the School row; the old object is removed
 *  when the new one landed under a different extension. */
export async function recordSchoolLogo(path: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSchoolOwner(supabase))) return { error: 'Unauthorized' }
  const { data: userRes } = await supabase.auth.getUser()
  const { data: me } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', userRes.user!.id)
    .single()
  if (!me?.school_id) return { error: 'Unauthorized' }
  if (!path.startsWith(`${me.school_id}/`)) return { error: 'Unauthorized' }

  const { data: school } = await supabase.from('schools').select('logo_path').eq('id', me.school_id).maybeSingle()
  const { error } = await supabase.from('schools').update({ logo_path: path }).eq('id', me.school_id)
  if (error) return { error: error.message }
  if (school?.logo_path && school.logo_path !== path) {
    await supabase.storage.from('school-logos').remove([school.logo_path])
  }
  revalidatePath(PAGE)
  return {}
}

export async function removeSchoolLogo(): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSchoolOwner(supabase))) return { error: 'Unauthorized' }
  const { data: userRes } = await supabase.auth.getUser()
  const { data: me } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', userRes.user!.id)
    .single()
  if (!me?.school_id) return { error: 'Unauthorized' }

  const { data: school } = await supabase.from('schools').select('logo_path').eq('id', me.school_id).maybeSingle()
  const { error } = await supabase.from('schools').update({ logo_path: null }).eq('id', me.school_id)
  if (error) return { error: error.message }
  if (school?.logo_path) await supabase.storage.from('school-logos').remove([school.logo_path])
  revalidatePath(PAGE)
  return {}
}
