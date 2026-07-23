import { describe, it, expect } from 'vitest'
import {
  buildInstituteHeader,
  instituteHeaderIsBare,
  logoImageExtension,
  type SchoolHeaderRow,
} from '@/lib/institute-print'

// Seam: the one institution-header payload every printable renders (issue #92,
// map #91). Pages must never assemble a meta line by hand again.

const school = (over: Partial<SchoolHeaderRow> = {}): SchoolHeaderRow => ({
  name: 'আদর্শ মডেল স্কুল',
  address_line: 'ঝিকরগাছা, যশোর',
  mobile: '01711-000000',
  email: 'info@adarsha.edu.bd',
  eiin_no: '123456',
  institute_code: 'ASH-0142',
  mpo_code: null,
  center_code: null,
  logo_path: 'school-1/logo.png',
  ...over,
})

describe('buildInstituteHeader', () => {
  it('carries the name through unchanged', () => {
    expect(buildInstituteHeader(school()).name).toBe('আদর্শ মডেল স্কুল')
  })

  it('keeps the address exactly as typed (no hierarchy composition)', () => {
    expect(buildInstituteHeader(school()).addressLine).toBe('ঝিকরগাছা, যশোর')
  })

  it('joins mobile and email into one contact line', () => {
    expect(buildInstituteHeader(school()).contactLine).toBe('01711-000000 · info@adarsha.edu.bd')
  })

  it('drops the missing half of the contact line rather than printing a dangling separator', () => {
    expect(buildInstituteHeader(school({ email: null })).contactLine).toBe('01711-000000')
    expect(buildInstituteHeader(school({ mobile: null })).contactLine).toBe('info@adarsha.edu.bd')
  })

  it('omits the contact line entirely when neither is configured', () => {
    expect(buildInstituteHeader(school({ mobile: null, email: null })).contactLine).toBeNull()
  })

  it('labels every configured code on one line, Bangla by default', () => {
    const header = buildInstituteHeader(school({ mpo_code: 'MPO-77', center_code: 'C-9' }))
    expect(header.codesLine).toBe('EIIN: 123456 · প্রতিষ্ঠান কোড: ASH-0142 · এমপিও কোড: MPO-77 · কেন্দ্র কোড: C-9')
  })

  it('labels codes in English when asked', () => {
    const header = buildInstituteHeader(school({ institute_code: null }), 'en')
    expect(header.codesLine).toBe('EIIN: 123456')
  })

  it('omits the codes line when the school has configured none', () => {
    const bare = school({ eiin_no: null, institute_code: null, mpo_code: null, center_code: null })
    expect(buildInstituteHeader(bare).codesLine).toBeNull()
  })

  it('turns a stored logo path into the app route that serves it, not a raw storage path', () => {
    expect(buildInstituteHeader(school()).logoUrl).toBe('/api/school-logo')
    expect(buildInstituteHeader(school({ logo_path: null })).logoUrl).toBeNull()
  })

  it('trims whitespace-only fields to nothing', () => {
    const header = buildInstituteHeader(school({ address_line: '   ', mobile: ' ', email: '  ' }))
    expect(header.addressLine).toBeNull()
    expect(header.contactLine).toBeNull()
  })
})

describe('instituteHeaderIsBare', () => {
  it('is true for a school that configured nothing beyond its name', () => {
    const bare = school({
      address_line: null,
      mobile: null,
      email: null,
      eiin_no: null,
      institute_code: null,
      mpo_code: null,
      center_code: null,
      logo_path: null,
    })
    expect(instituteHeaderIsBare(buildInstituteHeader(bare))).toBe(true)
  })

  it('is false once any header detail exists', () => {
    expect(instituteHeaderIsBare(buildInstituteHeader(school()))).toBe(false)
  })
})

describe('logoImageExtension', () => {
  it('maps the three accepted mime types', () => {
    expect(logoImageExtension('image/jpeg')).toBe('jpg')
    expect(logoImageExtension('image/png')).toBe('png')
    expect(logoImageExtension('image/webp')).toBe('webp')
  })

  it('rejects anything else (the bucket would reject it server-side too)', () => {
    expect(logoImageExtension('application/pdf')).toBeNull()
    expect(logoImageExtension('image/gif')).toBeNull()
  })
})
