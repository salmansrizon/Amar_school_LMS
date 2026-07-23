import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PrintPage,
  InstituteHeader,
  InfoGrid,
  GradePanelRow,
  SignatureRow,
  QrFooterRow,
  PhotoBox,
  Badge,
  PaginatedSheet,
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

describe('InstituteHeader', () => {
  it('renders Bangla name, meta and document title', () => {
    const html = renderToStaticMarkup(
      <InstituteHeader
        name="আদর্শ উচ্চ বিদ্যালয়"
        meta="EIIN: 123456"
        docTitle="মার্কশিট — বার্ষিক পরীক্ষা ২০২৫"
      />,
    )
    expect(html).toContain('আদর্শ উচ্চ বিদ্যালয়')
    expect(html).toContain('EIIN: 123456')
    expect(html).toContain('মার্কশিট — বার্ষিক পরীক্ষা ২০২৫')
  })

  it('omits the meta line when not given', () => {
    const withMeta = renderToStaticMarkup(
      <InstituteHeader name="School" meta="EIIN: 999" docTitle="Doc" />,
    )
    const withoutMeta = renderToStaticMarkup(<InstituteHeader name="School" docTitle="Doc" />)
    expect(withMeta).toContain('EIIN: 999')
    expect(withoutMeta).not.toContain('EIIN')
    // One fewer child div when meta is absent.
    expect(withoutMeta.match(/<div/g)!.length).toBe(withMeta.match(/<div/g)!.length - 1)
  })

  // Issue #92: the header carries the full institution block. Callers that
  // still pass only name/meta (swept in #99) must keep rendering as before.
  it('renders the full institution block when given one', () => {
    const html = renderToStaticMarkup(
      <InstituteHeader
        institute={{
          name: 'আদর্শ মডেল স্কুল',
          addressLine: 'ঝিকরগাছা, যশোর',
          contactLine: '01711-000000 · info@adarsha.edu.bd',
          codesLine: 'EIIN: 123456',
          logoUrl: '/api/school-logo',
        }}
        docTitle="প্রবেশপত্র"
      />,
    )
    expect(html).toContain('আদর্শ মডেল স্কুল')
    expect(html).toContain('ঝিকরগাছা, যশোর')
    expect(html).toContain('01711-000000 · info@adarsha.edu.bd')
    expect(html).toContain('EIIN: 123456')
    expect(html).toContain('/api/school-logo')
    expect(html).toContain('প্রবেশপত্র')
  })

  it('omits absent institution lines and the logo slot', () => {
    const html = renderToStaticMarkup(
      <InstituteHeader
        institute={{
          name: 'School',
          addressLine: null,
          contactLine: null,
          codesLine: null,
          logoUrl: null,
        }}
        docTitle="Doc"
      />,
    )
    expect(html).toContain('School')
    expect(html).not.toContain('<img')
  })

  it('prefers the institute payload over a legacy name/meta pair', () => {
    const html = renderToStaticMarkup(
      <InstituteHeader
        name="Stale Name"
        meta="EIIN: 999"
        institute={{
          name: 'Real Name',
          addressLine: null,
          contactLine: null,
          codesLine: 'EIIN: 123456',
          logoUrl: null,
        }}
        docTitle="Doc"
      />,
    )
    expect(html).toContain('Real Name')
    expect(html).not.toContain('Stale Name')
    expect(html).toContain('EIIN: 123456')
    expect(html).not.toContain('EIIN: 999')
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

describe('PaginatedSheet', () => {
  it('repeats its header on every printed page via a table header group', () => {
    const html = renderToStaticMarkup(
      <PaginatedSheet header={<span>repeated header</span>}>
        <p>long body</p>
      </PaginatedSheet>,
    )
    expect(html).toContain('<thead')
    expect(html).toContain('repeated header')
    expect(html).toContain('long body')
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
  })
})

describe('QrFooterRow', () => {
  it('shows the placeholder box and powered-by footer by default', () => {
    const html = renderToStaticMarkup(<QrFooterRow qrLabel="QR কোড" poweredBy="Powered by X" />)
    expect(html).toContain('QR কোড')
    expect(html).toContain('Powered by X')
  })

  it('a real QR node replaces the placeholder', () => {
    const html = renderToStaticMarkup(
      <QrFooterRow qrLabel="QR কোড" poweredBy="Powered by X" qr={<svg data-real-qr />} />,
    )
    expect(html).toContain('data-real-qr')
    expect(html).not.toContain('QR কোড')
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
