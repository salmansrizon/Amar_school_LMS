'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatBytes } from '@/lib/routine'
import { albumCountLabel, albumIsFull, galleryImageExtension, photoExceedsCap } from '@/lib/publishing'
import { t, type Lang } from '@/lib/i18n'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'
import { deleteGalleryPhoto, galleryUploadPath, recordGalleryPhoto } from '../actions'

export function PhotoGrid({
  albumId,
  maxImages,
  maxImageSizeBytes,
  photos,
  lang,
}: {
  albumId: string
  maxImages: number
  maxImageSizeBytes: number
  photos: { id: string; file_name: string }[]
  lang: Lang
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = albumIsFull(photos.length, maxImages)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const ext = galleryImageExtension(file.type)
    if (!ext) {
      setError(t('gallery.badType', lang))
      return
    }
    if (full) {
      setError(t('gallery.albumFull', lang))
      return
    }
    setBusy(true)
    // Compress before the cap check so large photos fit the album's byte cap.
    const photo = await compressImage(file, IMAGE_PRESETS.gallery)
    if (photoExceedsCap(photo.size, maxImageSizeBytes)) {
      setError(t('gallery.tooBig', lang))
      setBusy(false)
      return
    }
    // Ask the server for the canonical path (derived from the caller's School),
    // then upload the bytes straight to Storage; the row-locking cap trigger
    // is still the real authority when the row gets recorded below.
    const { path, error: pathErr } = await galleryUploadPath(albumId, photo.type)
    if (pathErr || !path) {
      setError(pathErr ?? 'Upload failed')
      setBusy(false)
      return
    }
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('gallery')
      .upload(path, photo, { contentType: photo.type })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const res = await recordGalleryPhoto(albumId, path, file.name, photo.size)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    if (res.error) {
      // The insert failed (e.g. the cap trigger rejected it) — the uploaded
      // object is now orphaned; clean it up so it doesn't linger unreferenced.
      await supabase.storage.from('gallery').remove([path])
      setError(res.error)
      return
    }
    router.refresh()
  }

  async function onDelete(photoId: string) {
    if (!window.confirm(t('gallery.confirmDeletePhoto', lang))) return
    setError(null)
    setBusy(true)
    const res = await deleteGalleryPhoto(photoId, albumId)
    setBusy(false)
    if (res.error) setError(res.error)
    else router.refresh()
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
            {albumCountLabel(photos.length, maxImages)} {t('gallery.photos', lang)}
          </span>
          <span className="text-xs text-muted">
            {t('gallery.maxSizeLabel', lang)}: {formatBytes(maxImageSizeBytes) ?? `${maxImageSizeBytes} B`}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          disabled={busy || full}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? t('gallery.uploading', lang) : `+ ${t('gallery.uploadPhotos', lang)}`}
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}
      {!photos.length ? (
        <p className="text-sm text-muted">{t('gallery.noPhotos', lang)}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/gallery-photo?photo=${p.id}`}
                alt={p.file_name}
                loading="lazy"
                className="h-24 w-full rounded-md border border-line object-cover"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(p.id)}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-sm border border-line-strong bg-paper text-xs text-alert-deep disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
