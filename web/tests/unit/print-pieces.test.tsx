import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PrintPage,
  InfoGrid,
  GradePanelRow,
  SignatureRow,
  QrFooterRow,
  PhotoBox,
  Badge,
  PrintFrame,
  PrintWatermark,
} from '@/components/print/pieces'
import { PRINT_THEMES } from '@/lib/print-themes'

// Seam: the shared printable template layer (ADR 0007, issue #25).

describe('PrintPage', () => {
  it('renders children on a sheet', () => {
    const html = renderToStaticMarkup(
      <PrintPage>
        <p>sheet body</p>
      </PrintPage>,
    )
    expect(html).toContain('sheet body')
  })

  it('page break applies to every sheet except the last (no blank trailing page)', () => {
    const html = renderToStaticMarkup(
      <>
        <PrintPage>one</PrintPage>
        <PrintPage>two</PrintPage>
      </>,
    )
    expect(html.match(/not-last:break-after-page/g)).toHaveLength(2)
  })
})

describe('PrintPage theming', () => {
  it('paints paper and ink from a curated preset (issue #94)', () => {
    const slate = PRINT_THEMES.find((t) => t.key === 'slate')!
    const html = renderToStaticMarkup(<PrintPage theme={slate}>body</PrintPage>)
    expect(html).toContain(slate.paper)
    expect(html).toContain(slate.ink)
    // The app's paper token must not fight the preset's own background.
    expect(html).not.toContain('bg-paper')
  })

  it('keeps the app paper token when unthemed', () => {
    const html = renderToStaticMarkup(<PrintPage>body</PrintPage>)
    expect(html).toContain('bg-paper')
  })
})

// The frame every A4 document prints in (owner's decision 2026-10-09). What
// repeats and where is CSS (globals.css, checked against real PDFs); these pin
// the markup that CSS hangs on.
describe('PrintFrame', () => {
  const institute = {
    name: 'আদর্শ মডেল স্কুল',
    addressLine: 'ঝিকরগাছা, যশোর',
    contactLine: '01711-000000 · info@adarsha.edu.bd',
    codesLine: 'EIIN: 123456 · এমপিও কোড: MPO-77',
    logoUrl: '/api/school-logo',
  }
  const frame = (over: Partial<Parameters<typeof PrintFrame>[0]> = {}) =>
    renderToStaticMarkup(
      <PrintFrame lang="bn" institute={institute} docTitle="মার্কশিট — বার্ষিক পরীক্ষা ২০২৫" qrSvg="<svg data-qr></svg>" {...over}>
        <p>long body</p>
      </PrintFrame>,
    )

  it('puts both bands in the repeating header group, the footer spacer in the footer group, the content between', () => {
    const html = frame()
    const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'))
    const tfoot = html.slice(html.indexOf('<tfoot'), html.indexOf('</tfoot>'))
    const tbody = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'))
    expect(thead).toContain('print-band-top')
    expect(thead).toContain('print-band-bottom')
    expect(tfoot).toContain('print-doc-foot')
    expect(tfoot).not.toContain('print-band')
    expect(tbody).toContain('long body')
    expect(tbody).not.toContain('print-band')
  })

  it('header band: logo, name, every letterhead field and the document title', () => {
    const html = frame()
    const band = html.slice(html.indexOf('print-band-top'), html.indexOf('print-band-bottom'))
    expect(band).toContain('src="/api/school-logo"')
    expect(band).toContain('আদর্শ মডেল স্কুল')
    expect(band).toContain('ঝিকরগাছা, যশোর · 01711-000000 · info@adarsha.edu.bd')
    expect(band).toContain('EIIN: 123456 · এমপিও কোড: MPO-77')
    expect(band).toContain('মার্কশিট — বার্ষিক পরীক্ষা ২০২৫')
    // Long text is cut, never wrapped into a taller band.
    expect(band.match(/truncate/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('footer band: the QR, the powered-by line, no signatures', () => {
    const html = frame()
    const band = html.slice(html.indexOf('print-band-bottom'), html.indexOf('</thead>'))
    expect(band).toContain('<svg data-qr>')
    expect(band).toContain('EdumeBD দ্বারা পরিচালিত')
    expect(frame({ lang: 'en' })).toContain('Powered by EdumeBD')
  })

  it('falls back to the labelled box while there is no QR', () => {
    const html = frame({ qrSvg: '' })
    expect(html).not.toContain('<svg')
    expect(html).toContain('QR কোড')
  })

  it('names its page by orientation and language (the page-number margin box)', () => {
    expect(frame()).toContain('print-doc-portrait-bn')
    const landscape = frame({ orientation: 'landscape', lang: 'en' })
    expect(landscape).toContain('print-doc-landscape-en')
    // The card sheets' own landscape page stays theirs.
    expect(landscape).toContain('print-landscape')
  })

  it('fill is opt-in', () => {
    expect(frame()).not.toContain('print-doc-fill')
    expect(frame({ fill: true })).toContain('print-doc-fill')
  })

  it('prints with no institute at all (a caller with no School)', () => {
    expect(frame({ institute: null })).toContain('long body')
  })

  it('carries the logo watermark in the repeating header group, so it prints on every page', () => {
    const html = frame()
    const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'))
    expect(thead).toContain('class="print-watermark"')
    expect(html.match(/print-watermark/g)).toHaveLength(1)
  })

  // Owner, 2026-10-09: no logo means blank — no brand logo, no placeholder, no
  // text standing in for it, in the header band or as the watermark.
  it('a school with no logo prints no image at all: the name stands alone, no watermark', () => {
    for (const html of [frame({ institute: { ...institute, logoUrl: null }, qrSvg: '' }), frame({ institute: null, qrSvg: '' })]) {
      expect(html).not.toContain('<img')
      expect(html).not.toContain('print-watermark')
      expect(html).not.toContain('edumebd-logo')
    }
    expect(frame({ institute: { ...institute, logoUrl: null } })).toContain('আদর্শ মডেল স্কুল')
  })

  it('a themed frame (admit card) tints the rule and the title, and paints a tinted paper on the table', () => {
    const slate = PRINT_THEMES.find((t) => t.key === 'slate')!
    const html = frame({ theme: slate })
    expect(html).toContain(`border-bottom-color:${slate.accent}`)
    expect(html).toContain(`<table style="background:${slate.paper}"`)
    // Plain white needs no paint, so the page number stays visible.
    const classic = PRINT_THEMES.find((t) => t.key === 'classic')!
    expect(frame({ theme: classic })).not.toContain('<table style=')
  })
})

describe('PrintWatermark', () => {
  const institute = { name: 'S', addressLine: null, contactLine: null, codesLine: null, logoUrl: '/api/school-logo' }

  it('is a decorative <img> of the school logo itself', () => {
    const html = renderToStaticMarkup(<PrintWatermark institute={institute} />)
    expect(html).toContain('<img')
    expect(html).toContain('src="/api/school-logo"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('alt=""')
  })

  it('renders nothing without a logo — never a text fallback', () => {
    expect(renderToStaticMarkup(<PrintWatermark institute={{ ...institute, logoUrl: null }} />)).toBe('')
  })
})

describe('InfoGrid', () => {
  it('renders every label/value row', () => {
    const html = renderToStaticMarkup(
      <InfoGrid
        rows={[
          { label: 'রোল নম্বর', value: '01' },
          { label: 'শ্রেণি', value: 'অষ্টম' },
        ]}
      />,
    )
    expect(html).toContain('রোল নম্বর')
    expect(html).toContain('01')
    expect(html).toContain('অষ্টম')
  })
})

describe('GradePanelRow / SignatureRow', () => {
  it('renders totals and signature labels', () => {
    const html = renderToStaticMarkup(
      <>
        <GradePanelRow>
          <span>GPA 5.00</span>
        </GradePanelRow>
        <SignatureRow labels={['শ্রেণি শিক্ষক', 'প্রধান শিক্ষক']} />
      </>,
    )
    expect(html).toContain('GPA 5.00')
    expect(html).toContain('শ্রেণি শিক্ষক')
    expect(html).toContain('প্রধান শিক্ষক')
    // Room for a real signature and stamp above the line, clear space below, kept whole.
    expect(html).toContain('pt-[19mm]')
    expect(html).toContain('pb-[8mm]')
    expect(html).toContain('print-keep')
  })
})

describe('QrFooterRow', () => {
  it('shows the placeholder box and powered-by footer by default', () => {
    const html = renderToStaticMarkup(<QrFooterRow qrLabel="QR কোড" poweredBy="Powered by X" />)
    expect(html).toContain('QR কোড')
    expect(html).toContain('Powered by X')
  })

  it('a real QR replaces the placeholder', () => {
    const html = renderToStaticMarkup(
      <QrFooterRow qrLabel="QR কোড" poweredBy="Powered by X" qrSvg="<svg data-real-qr></svg>" />,
    )
    expect(html).toContain('data-real-qr')
    expect(html).not.toContain('QR কোড')
  })

  it('no QR yet (empty string) keeps the placeholder', () => {
    const html = renderToStaticMarkup(<QrFooterRow qrLabel="QR কোড" poweredBy="Powered by X" qrSvg="" />)
    expect(html).toContain('QR কোড')
  })
})

describe('PhotoBox', () => {
  it('shows the dashed placeholder label when no photo is set', () => {
    const html = renderToStaticMarkup(<PhotoBox src={null} label="ছবি" />)
    expect(html).toContain('ছবি')
    expect(html).not.toContain('<img')
  })

  it('renders a real photo instead of the placeholder when src is set', () => {
    const html = renderToStaticMarkup(<PhotoBox src="/api/student-photo?student=abc" label="ছবি" />)
    expect(html).toContain('<img')
    expect(html).toContain('/api/student-photo?student=abc')
  })
})

describe('Badge warning tone', () => {
  it('renders the low-but-passing-grade tone distinctly from success/alert', () => {
    const success = renderToStaticMarkup(<Badge tone="success">A+</Badge>)
    const warning = renderToStaticMarkup(<Badge tone="warning">C</Badge>)
    const alert = renderToStaticMarkup(<Badge tone="alert">F</Badge>)
    expect(warning).toContain('C')
    expect(warning).not.toBe(success.replace('A+', 'C'))
    expect(warning).not.toBe(alert.replace('F', 'C'))
  })
})
