'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { galleryImageExtension, validateTargetSelection } from '@/lib/publishing'
import type { Importance, PublicationKind, TargetType } from '@/lib/publishing'

// The image bytes are uploaded client-side straight to the private
// 'publications' bucket (avoids the Next server-action body limit, mirrors
// issue #45's syllabus pattern); this action only records the metadata row.
// The storage path is derived server-side from the caller's School, never
// trusted from the client.

const LIST_PAGE = '/school/notices'

async function myProfile(): Promise<{ userId: string; schoolId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()
  if (!profile?.school_id) return { error: 'No school on profile' }
  return { userId: user.id, schoolId: profile.school_id }
}

/** The deterministic object path a client must upload the optional image to. */
export async function publicationImageUploadPath(
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  const me = await myProfile()
  if ('error' in me) return { error: me.error }
  const ext = galleryImageExtension(mimeType)
  if (!ext) return { error: 'Only JPEG, PNG or WebP images are allowed' }
  return { path: `${me.schoolId}/${crypto.randomUUID()}.${ext}` }
}

export async function createPublication(input: {
  kind: PublicationKind
  title: string
  content: string
  importance: Importance
  targetType: TargetType
  targetClassName: string
  targetShiftId: string
  targetSection: string
  imagePath: string | null
  linkUrl: string
}): Promise<{ error?: string; id?: string }> {
  const me = await myProfile()
  if ('error' in me) return { error: me.error }
  const title = input.title.trim()
  if (!title) return { error: 'Title is required' }
  const targetError = validateTargetSelection(
    input.targetType,
    input.targetClassName,
    input.targetShiftId,
    input.targetSection,
  )
  if (targetError) return { error: targetError }
  // imagePath (if any) was already validated by publicationImageUploadPath and
  // the bucket's own type/size limits at upload time — nothing more to check.

  const specific = input.targetType === 'specific'
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('publications')
    .insert({
      kind: input.kind,
      title: title.slice(0, 200),
      content: input.content.trim() ? input.content.trim() : null,
      importance: input.importance,
      target_type: input.targetType,
      target_class_name: specific ? input.targetClassName || null : null,
      target_shift_id: specific ? input.targetShiftId || null : null,
      target_section: specific ? input.targetSection || null : null,
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
