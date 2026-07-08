import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { MarkSheetDocument } from '@/lib/pdf/templates/mark-sheet'
import { renderPdf } from '@/lib/pdf/render'
import { sampleMarkSheet } from '@/lib/pdf/sample-data'
import type { MarkSheetData } from '@/lib/pdf/types'

// Every PDF file begins with this signature.
const PDF_MAGIC = '%PDF-'

function render(data: MarkSheetData, lang: 'bn' | 'en') {
  return renderPdf(createElement(MarkSheetDocument, { data, lang }))
}

describe('mark-sheet PDF seam (#25)', () => {
  it('renders a non-empty PDF for the Bangla sample', async () => {
    const bytes = await render(sampleMarkSheet, 'bn')
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe(PDF_MAGIC)
  })

  it('embeds the Hind Siliguri font so Bangla glyphs render (not tofu)', async () => {
    const bytes = await render(sampleMarkSheet, 'bn')
    const body = Buffer.from(bytes).toString('latin1')
    // Subsetted names look like ABCDEF+HindSiliguri-Regular.
    expect(body).toMatch(/HindSiliguri/)
    expect(body).toMatch(/FontFile2/)
  })

  it('renders the English variant too', async () => {
    const bytes = await render(sampleMarkSheet, 'en')
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe(PDF_MAGIC)
  })

  it('still renders when optional fields are absent', async () => {
    const minimal: MarkSheetData = {
      ...sampleMarkSheet,
      student: { ...sampleMarkSheet.student, guardianName: undefined },
      institute: { ...sampleMarkSheet.institute, registration: undefined },
      summary: { ...sampleMarkSheet.summary, position: undefined, gpa: undefined },
    }
    const bytes = await render(minimal, 'bn')
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })
})
