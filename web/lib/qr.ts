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
