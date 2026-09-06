'use server'

import { revalidatePath } from 'next/cache'
import { currentOwner } from '@/lib/school/actor'
import { validateInstituteProfile, type InstituteProfileInput } from '@/lib/institute'
import { logoImageExtension } from '@/lib/institute-print'
import { isThemeKey, type ThemedDocType } from '@/lib/print-themes'
import { createSignedUpload, type SignedUpload } from '@/lib/storage/signed-upload'

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
    roll_number_increment: Number(formData.get('roll_number_increment') ?? 1),
    // A checkbox list can't submit duplicates by construction, but dedupe
    // anyway (#576's resolution) since nothing downstream should have to.
    configured_shifts: [...new Set(formData.getAll('configured_shifts').map(String))],
  }
  const err = validateInstituteProfile(input)
  if (err) return { error: err }

  const actor = await currentOwner()
  if ('error' in actor) return { error: actor.error }
  const { supabase, schoolId } = actor

  const locationId = optStr(formData, 'location_id')
  const clusterId = optStr(formData, 'cluster_id')

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
      roll_number_increment: input.roll_number_increment,
      configured_shifts: input.configured_shifts,
    })
    .eq('id', schoolId)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** The school's default admit-card palette (issue #94). Stored keyed by
 *  document type so adding a themed printable later is a row, not a column. */
export async function savePrintTheme(
  docType: ThemedDocType,
  paletteKey: string,
): Promise<{ error?: string }> {
  if (!isThemeKey(paletteKey)) return { error: 'unknownTheme' }
  const actor = await currentOwner()
  if ('error' in actor) return { error: actor.error }
  const { supabase, schoolId } = actor

  const { error } = await supabase.from('school_print_themes').upsert(
    { school_id: schoolId, doc_type: docType, palette_key: paletteKey, updated_at: new Date().toISOString() },
    { onConflict: 'school_id,doc_type' },
  )
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return {}
}

/** The deterministic object path the owner's browser uploads the logo to
 *  (issue #92) — mirrors galleryUploadPath: the server owns the path, the
 *  client owns the bytes. One object per School, replaced in place. */
export async function schoolLogoUploadTicket(
  mimeType: string,
): Promise<{ upload?: SignedUpload; error?: string }> {
  const ext = logoImageExtension(mimeType)
  if (!ext) return { error: 'logoBadType' }
  const actor = await currentOwner()
  if ('error' in actor) return { error: actor.error }
  return createSignedUpload('school-logos', `${actor.schoolId}/logo.${ext}`)
}

/** Records the uploaded object on the School row; the old object is removed
 *  when the new one landed under a different extension. */
export async function recordSchoolLogo(path: string): Promise<{ error?: string }> {
  const actor = await currentOwner()
  if ('error' in actor) return { error: actor.error }
  const { supabase, schoolId } = actor
  if (!path.startsWith(`${schoolId}/`)) return { error: 'Unauthorized' }

  const { data: school } = await supabase.from('schools').select('logo_path').eq('id', schoolId).maybeSingle()
  const { error } = await supabase.from('schools').update({ logo_path: path }).eq('id', schoolId)
  if (error) return { error: error.message }
  if (school?.logo_path && school.logo_path !== path) {
    await supabase.storage.from('school-logos').remove([school.logo_path])
  }
  revalidatePath(PAGE)
  return {}
}

export async function removeSchoolLogo(): Promise<{ error?: string }> {
  const actor = await currentOwner()
  if ('error' in actor) return { error: actor.error }
  const { supabase, schoolId } = actor

  const { data: school } = await supabase.from('schools').select('logo_path').eq('id', schoolId).maybeSingle()
  const { error } = await supabase.from('schools').update({ logo_path: null }).eq('id', schoolId)
  if (error) return { error: error.message }
  if (school?.logo_path) await supabase.storage.from('school-logos').remove([school.logo_path])
  revalidatePath(PAGE)
  return {}
}
