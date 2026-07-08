import type { NextRequest } from 'next/server'
import type { Lang } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'
import { MarkSheetDocument } from '@/lib/pdf/templates/mark-sheet'
import { renderPdf } from '@/lib/pdf/render'
import { sampleMarkSheet } from '@/lib/pdf/sample-data'

// react-pdf needs Node APIs — pin this route to the Node serverless runtime
// (never Edge). See ADR 0007.
export const runtime = 'nodejs'

/**
 * #25 prototype endpoint: renders the sample mark sheet to a real PDF. Language
 * follows the `lang` query param, else the app's language cookie (ADR 0004).
 * `?download=1` forces a save dialog; otherwise it renders inline for preview.
 *
 * Real marks data arrives with §5.5 (issues #32/#33); this route proves the
 * server-side PDF seam end-to-end with the shared template pieces.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const override = url.searchParams.get('lang')
  const lang: Lang = override === 'en' ? 'en' : override === 'bn' ? 'bn' : await currentLang()
  const download = url.searchParams.get('download') === '1'

  const pdf = await renderPdf(<MarkSheetDocument data={sampleMarkSheet} lang={lang} />)

  const disposition = download ? 'attachment' : 'inline'
  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="mark-sheet-sample.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
