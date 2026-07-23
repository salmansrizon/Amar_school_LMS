// Client-side image compression, run before uploading to Supabase Storage.
//
// Printed photos sit in small boxes on ID/admit cards at 300 DPI (ADR 0007),
// so they need far fewer pixels than a raw phone photo. We resize to a
// print-sufficient longest side and re-encode to WebP, which lets the 1 GB
// storage budget hold ~20x more images with no visible loss on paper
// (issue #120). All image buckets already allow image/webp.
//
// Safety: non-images (PDF) and unsupported formats pass through untouched, and
// any decode/encode failure falls back to the original file — we never risk
// losing an upload to a compression error. Callers must read the returned
// Blob's `type` and `size` (not the original File's) for the storage path
// extension, contentType, and any recorded size, since re-encoding changes both.

export interface CompressOptions {
  /** Longest-side cap in px. Larger images are scaled down to this; smaller ones are left as-is. */
  maxDim: number
  /** Encoder quality, 0..1 (default 0.85). */
  quality?: number
}

// Per-bucket presets, each sized to that image's largest real use.
export const IMAGE_PRESETS = {
  // 2x the ID/admit-card print box at 300 DPI — sharp on paper.
  studentPhoto: { maxDim: 1200, quality: 0.85 },
  // Display-only surfaces.
  gallery: { maxDim: 1600, quality: 0.8 },
  publication: { maxDim: 1600, quality: 0.8 },
  attachment: { maxDim: 1600, quality: 0.8 },
} as const satisfies Record<string, CompressOptions>

// Only raster formats we can safely re-encode. GIF (animation) and SVG (vector)
// are deliberately excluded and pass through unchanged.
const COMPRESSIBLE = /^image\/(jpeg|png|webp)$/

/**
 * Returns a compressed Blob for a compressible image, or the original `file`
 * unchanged for non-images / unsupported browsers / any failure. Read the
 * result's `.type` and `.size` for downstream path + metadata.
 */
export async function compressImage(file: File, opts: CompressOptions): Promise<Blob> {
  if (!COMPRESSIBLE.test(file.type)) return file
  const quality = opts.quality ?? 0.85

  let bitmap: ImageBitmap
  try {
    // `imageOrientation: 'from-image'` bakes EXIF rotation into the pixels so
    // rotated phone photos print upright (and don't rely on a stripped tag).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }

  const longest = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, opts.maxDim / longest)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  // WebP where the browser can encode it; JPEG is the universal fallback.
  const blob = (await toBlob(canvas, 'image/webp', quality)) ?? (await toBlob(canvas, 'image/jpeg', quality))
  if (!blob) return file

  // Never make it worse: tiny or already-optimized images can grow on re-encode.
  return blob.size < file.size ? blob : file
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}
