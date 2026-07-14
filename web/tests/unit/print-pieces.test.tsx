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
} from '@/components/print/pieces'

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
