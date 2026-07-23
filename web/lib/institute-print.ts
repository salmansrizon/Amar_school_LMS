import type { createClient } from '@/lib/supabase/server'
import type { Lang } from '@/lib/i18n'
import type { ThemedDocType } from '@/lib/print-themes'

// The institution header every printable shows (issue #92, map #91,
// docs/improvement.md "General Printing Requirements"). One payload, one
// builder: no page assembles `EIIN: {n}` — or any other meta line — by hand.
//
// The address is whatever the owner typed on the institute profile form
// (grilling decision 5); the `locations` hierarchy stops at union level and
// carries no street line, so composing from it would print a worse address.

/** The `schools` columns the header needs — the exact select list loaders use. */
export interface SchoolHeaderRow {
  name: string
  address_line: string | null
  mobile: string | null
  email: string | null
  eiin_no: string | null
  institute_code: string | null
  mpo_code: string | null
  center_code: string | null
  logo_path: string | null
}

export const SCHOOL_HEADER_COLUMNS =
  'name, address_line, mobile, email, eiin_no, institute_code, mpo_code, center_code, logo_path'

/** Presentation-ready header: four already-composed lines plus the logo URL.
 *  Pieces render what is here and decide nothing. */
export interface InstitutePrintHeader {
  name: string
  addressLine: string | null
  contactLine: string | null
  codesLine: string | null
  logoUrl: string | null
}

/** The route that mints a signed URL for the private logo object. */
export const SCHOOL_LOGO_URL = '/api/school-logo'

const SEPARATOR = ' · '

const CODE_LABELS: { key: keyof SchoolHeaderRow; label: { bn: string; en: string } }[] = [
  { key: 'eiin_no', label: { bn: 'EIIN', en: 'EIIN' } },
  { key: 'institute_code', label: { bn: 'প্রতিষ্ঠান কোড', en: 'Institute Code' } },
  { key: 'mpo_code', label: { bn: 'এমপিও কোড', en: 'MPO Code' } },
  { key: 'center_code', label: { bn: 'কেন্দ্র কোড', en: 'Center Code' } },
]

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length ? trimmed : null
}

/** Join the parts that exist; a missing part must not leave a dangling separator. */
function joinParts(parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => p !== null)
  return present.length ? present.join(SEPARATOR) : null
}

export function buildInstituteHeader(school: SchoolHeaderRow, lang: Lang = 'bn'): InstitutePrintHeader {
  const codes = CODE_LABELS.map(({ key, label }) => {
    const value = clean(school[key] as string | null)
    return value ? `${label[lang]}: ${value}` : null
  })
  return {
    name: school.name,
    addressLine: clean(school.address_line),
    contactLine: joinParts([clean(school.mobile), clean(school.email)]),
    codesLine: joinParts(codes),
    logoUrl: clean(school.logo_path) ? SCHOOL_LOGO_URL : null,
  }
}

/** True when the school configured nothing but its name — the header collapses
 *  to the pre-#92 single-line look, which is the honest thing to print. */
export function instituteHeaderIsBare(header: InstitutePrintHeader): boolean {
  return !header.addressLine && !header.contactLine && !header.codesLine && !header.logoUrl
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** The one loader every printable page calls. RLS scopes `schools` to the
 *  caller's own School, so no id argument is needed; a caller with no School
 *  (shouldn't reach a printable) gets null and keeps its own fallback. */
export async function loadInstitutePrintHeader(
  supabase: Supabase,
  lang: Lang = 'bn',
): Promise<InstitutePrintHeader | null> {
  const { data } = await supabase.from('schools').select(SCHOOL_HEADER_COLUMNS).maybeSingle()
  if (!data) return null
  return buildInstituteHeader(data as unknown as SchoolHeaderRow, lang)
}

/** The school's saved palette key for a document type (issue #94), or null
 *  while it has never chosen one. Readable by any school member — every
 *  printable needs it — so no role check here beyond RLS. */
export async function loadPrintThemeKey(
  supabase: Supabase,
  docType: ThemedDocType,
): Promise<string | null> {
  const { data } = await supabase
    .from('school_print_themes')
    .select('palette_key')
    .eq('doc_type', docType)
    .maybeSingle()
  return data?.palette_key ?? null
}

/** Mirrors the 'school-logos' bucket's file_size_limit (migration 0056) so the
 *  client can reject an oversized file before spending the upload. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

/** File extension for an accepted logo mime type; null rejects the upload
 *  client-side (the bucket's allowed_mime_types rejects it server-side too). */
export function logoImageExtension(mimeType: string): string | null {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return null
}
