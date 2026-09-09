'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { currentActor } from '@/lib/school/actor'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { galleryImageExtension, validateTargetSelection, TARGET_SELECTION_ERROR_KEY } from '@/lib/publishing'
import type { Importance, PublicationKind, TargetScope } from '@/lib/publishing'
import { createSignedUpload, type SignedUpload } from '@/lib/storage/signed-upload'

// The image bytes are uploaded client-side straight to the private
// 'publications' bucket (avoids the Next server-action body limit, mirrors
// issue #45's syllabus pattern); this action only records the metadata row.
// The storage path is derived server-side from the caller's School, never
// trusted from the client.

const LIST_PAGE = '/school/notices'

/** The deterministic object path a client must upload the optional image to. */
export async function publicationImageUploadTicket(
  mimeType: string,
): Promise<{ upload?: SignedUpload; error?: string }> {
  const me = await currentActor()
  if ('error' in me) return { error: me.error }
  const ext = galleryImageExtension(mimeType)
  if (!ext) return { error: 'Only JPEG, PNG or WebP images are allowed' }
  return createSignedUpload('publications', `${me.schoolId}/${crypto.randomUUID()}.${ext}`)
}

export async function createPublication(input: {
  kind: PublicationKind
  title: string
  content: string
  importance: Importance
  targetScope: TargetScope
  /** targetScope === 'offering' */
  classOfferingId: string
  /** targetScope === 'broadcast' */
  targetClassName: string
  targetShift: string
  targetGroupDepartment: string
  targetSection: string
  imagePath: string | null
  linkUrl: string
}): Promise<{ error?: string; id?: string }> {
  const me = await currentActor()
  if ('error' in me) return { error: me.error }
  const title = input.title.trim()
  if (!title) return { error: 'Title is required' }

  const supabase = me.supabase
  // A broadcast target's Academic Year is pinned to the School's active year
  // at compose time (#599) -- it never spans years and is never "Any".
  const { data: school } = await supabase
    .from('schools')
    .select('active_academic_year')
    .eq('id', me.schoolId)
    .maybeSingle()
  const activeAcademicYear = (school?.active_academic_year ?? null) as number | null

  const scope = input.targetScope
  const targetError = validateTargetSelection({
    scope,
    classOfferingId: input.classOfferingId,
    className: input.targetClassName,
    academicYear: activeAcademicYear,
    shift: input.targetShift,
    groupDepartment: input.targetGroupDepartment,
    section: input.targetSection,
  })
  if (targetError) return { error: t(TARGET_SELECTION_ERROR_KEY[targetError], await currentLang()) }
  // imagePath (if any) was already validated by publicationImageUploadPath and
  // the bucket's own type/size limits at upload time — nothing more to check.

  const broadcast = scope === 'broadcast'
  // target_scope is the sole targeting discriminator (map #598 Wave 7/#608 --
  // target_type is gone). The per-scope CHECK invariants (migration 0195)
  // require every non-owning column NULL for 'all'/'offering', so the
  // conditional column values below are load-bearing, not cosmetic.
  const { data, error } = await supabase
    .from('publications')
    .insert({
      kind: input.kind,
      title: title.slice(0, 200),
      content: input.content.trim() ? input.content.trim() : null,
      importance: input.importance,
      target_scope: scope,
      class_offering_id: scope === 'offering' ? input.classOfferingId : null,
      target_class_name: broadcast ? input.targetClassName : null,
      target_academic_year: broadcast ? activeAcademicYear : null,
      target_shift: broadcast ? input.targetShift || null : null,
      target_group_department: broadcast ? input.targetGroupDepartment || null : null,
      target_section: broadcast ? input.targetSection || null : null,
      image_path: input.imagePath,
      link_url: input.linkUrl.trim() ? input.linkUrl.trim() : null,
      created_by: me.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(LIST_PAGE)
  return { id: data!.id }
}

export async function deletePublication(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('publications')
    .select('image_path')
    .eq('id', id)
    .maybeSingle()
  if (!row) return { error: 'Not found' }
  if (row.image_path) {
    await supabase.storage.from('publications').remove([row.image_path])
  }
  const { error } = await supabase.from('publications').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(LIST_PAGE)
  return {}
}
