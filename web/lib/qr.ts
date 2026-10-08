// QR-coded mark for printables (issue #33, PRD §5.5). ADR 0007 rules out a
// server PDF renderer, so this renders inline SVG at request time (server
// component) with no client bundle and no network round-trip. The `qrcode`
// package was not already a dependency (checked package.json before adding it).
//
// `payload` may be a bare identifying string (exam/mark-sheet authenticity
// mark) OR a real URL: the student ID card now encodes an absolute link to the
// public /verify/<token> page (issue #144), so scanning it opens a live
// validity check rather than being purely decorative.
import QRCode from 'qrcode'

/** Renders an inline SVG string encoding `payload` (an identifying string or a
 * verification URL) — embed via dangerouslySetInnerHTML. */
export async function renderAuthenticityQr(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: 'svg', margin: 0, width: 84 })
}

/** The verification QR every print carries (lib/print-verify.ts). Unlike the
 *  ID-card mark above it brings its own 4-module quiet zone and white ground,
 *  so it scans from tinted paper with nothing but its own box around it.
 *  112 CSS px prints 29.6 mm wide; a ~125-character URL is a version 7-8
 *  symbol, so one module is about 0.5 mm. */
export async function renderPrintQr(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 4, width: 112, errorCorrectionLevel: 'M' })
}
