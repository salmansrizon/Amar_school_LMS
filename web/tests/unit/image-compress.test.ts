import { describe, it, expect } from 'vitest'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'

// The real resize/re-encode path needs browser APIs (createImageBitmap, canvas)
// and is exercised in the browser, not here. These tests lock in the
// environment-independent safety contract: anything we can't safely re-encode
// must pass through byte-for-byte, so a PDF attachment (or GIF/SVG) is never
// mangled or dropped by the compression step.

function fileOf(type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], 'upload', { type })
}

describe('compressImage pass-through guard', () => {
  it('returns a PDF unchanged (same object)', async () => {
    const pdf = fileOf('application/pdf')
    expect(await compressImage(pdf, IMAGE_PRESETS.attachment)).toBe(pdf)
  })

  it('returns animated/vector images (gif, svg) unchanged', async () => {
    const gif = fileOf('image/gif')
    const svg = fileOf('image/svg+xml')
    expect(await compressImage(gif, IMAGE_PRESETS.gallery)).toBe(gif)
    expect(await compressImage(svg, IMAGE_PRESETS.gallery)).toBe(svg)
  })
})

describe('IMAGE_PRESETS', () => {
  it('every preset has a sane dimension cap and quality', () => {
    for (const preset of Object.values(IMAGE_PRESETS)) {
      expect(preset.maxDim).toBeGreaterThanOrEqual(600) // never below the ~300-DPI print need
      expect(preset.quality).toBeGreaterThan(0.5)
      expect(preset.quality).toBeLessThanOrEqual(1)
    }
  })
})
