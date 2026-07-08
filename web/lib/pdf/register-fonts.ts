import { Font } from '@react-pdf/renderer'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Register the document font once per process.
 *
 * @react-pdf/renderer ships only Helvetica/Times/Courier, none of which carry
 * Bengali glyphs — Bangla text (the default UI/data language, ADR 0004) would
 * render as blank tofu in a generated PDF. We register Hind Siliguri (the Family
 * design system's Bangla face, ADR 0006), which also covers Latin, so one family
 * renders both scripts.
 *
 * The app UI loads Hind Siliguri via next/font; the PDF layer cannot use that
 * (it renders outside the browser), so the TTFs are bundled here and resolved
 * relative to this module — stable under both the Node serverless runtime and
 * Vitest.
 */
const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts')

let registered = false

export const DOC_FONT = 'HindSiliguri'

export function registerFonts(): void {
  if (registered) return
  Font.register({
    family: DOC_FONT,
    fonts: [
      { src: path.join(fontsDir, 'HindSiliguri-Regular.ttf'), fontWeight: 400 },
      { src: path.join(fontsDir, 'HindSiliguri-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(fontsDir, 'HindSiliguri-Bold.ttf'), fontWeight: 700 },
    ],
  })
  // Bengali conjuncts must not be word-broken mid-cluster.
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}
