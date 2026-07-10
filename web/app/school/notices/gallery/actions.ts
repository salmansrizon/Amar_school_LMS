'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { galleryImageExtension } from '@/lib/publishing'

// Photo bytes are uploaded client-side straight to the private 'gallery'
// bucket (mirrors issue #45's syllabus pattern); these actions only manage
// album/photo metadata rows. The real, configurable per-album image-count and
// per-image-size caps are enforced by a DB trigger (migration 0037) — this
// file is not the authority, just the entry point that surfaces its errors.

const ALBUMS_PAGE = '/school/notices/gallery'

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

export async function createAlbum(formData: FormData): Promise<{ error?: string }> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Title is required' }
  const maxImagesRaw = formData.get('max_images')
  const maxSizeRaw = formData.get('max_image_size_mb')
  const maxImages = maxImagesRaw ? Number(maxImagesRaw) : 20
  const maxSizeMb = maxSizeRaw ? Number(maxSizeRaw) : 1
  if (!Number.isFinite(maxImages) || maxImages < 1 || maxImages > 500)
    return { error: 'Max images must be between 1 and 500' }
  if (!Number.isFinite(maxSizeMb) || maxSizeMb <= 0 || maxSizeMb > 20)
    return { error: 'Max photo size must be between 0 and 20 MB' }

  const supabase = await createClient()
  const { error } = await supabase.from('gallery_albums').insert({
    title: title.slice(0, 200),
    max_images: Math.round(maxImages),
    max_image_size_bytes: Math.round(maxSizeMb * 1024 * 1024),
  })
  if (error) return { error: error.message }
  revalidatePath(ALBUMS_PAGE)
  return {}
}

export async function deleteAlbum(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: photos } = await supabase.from('gallery_photos').select('storage_path').eq('album_id', id)
  if (photos?.length) {
    await supabase.storage.from('gallery').remove(photos.map((p) => p.storage_path))
  }
  const { error } = await supabase.from('gallery_albums').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(ALBUMS_PAGE)
  return {}
}

/** The deterministic object path a client must upload a new photo to. */
export async function galleryUploadPath(
  albumId: string,
  mimeType: string,
): Promise<{ path?: string; error?: string }> {
  const me = await myProfile()
  if ('error' in me) return { error: me.error }
  const ext = galleryImageExtension(mimeType)
  if (!ext) return { error: 'Only JPEG, PNG or WebP images are allowed' }
  const supabase = await createClient()
  // RLS-scoped: an album the caller can't see returns nothing.
  const { data: album } = await supabase.from('gallery_albums').select('id').eq('id', albumId).maybeSingle()
  if (!album) return { error: 'Album not found' }
  return { path: `${me.schoolId}/${albumId}/${crypto.randomUUID()}.${ext}` }
}

export async function recordGalleryPhoto(
  albumId: string,
  path: string,
  fileName: string,
  fileSize: number,
): Promise<{ error?: string }> {
  if (!Number.isInteger(fileSize) || fileSize < 1) return { error: 'Invalid file size' }
  const supabase = await createClient()
  const { error } = await supabase.from('gallery_photos').insert({
    album_id: albumId,
    storage_path: path,
    file_name: fileName.slice(0, 200),
    file_size: fileSize,
  })
  if (error) return { error: error.message }
  revalidatePath(`${ALBUMS_PAGE}/${albumId}`)
  revalidatePath(ALBUMS_PAGE)
  return {}
}

export async function deleteGalleryPhoto(photoId: string, albumId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('gallery_photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle()
  if (!row) return { error: 'Not found' }
  await supabase.storage.from('gallery').remove([row.storage_path])
  const { error } = await supabase.from('gallery_photos').delete().eq('id', photoId)
  if (error) return { error: error.message }
  revalidatePath(`${ALBUMS_PAGE}/${albumId}`)
  revalidatePath(ALBUMS_PAGE)
  return {}
}
