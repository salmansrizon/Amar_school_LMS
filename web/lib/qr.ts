// Exams IV (issue #33, PRD §5.5): QR-coded authenticity mark for printables.
// ADR 0007 rules out a server PDF renderer, and no verification endpoint
// exists yet (the mockups show a plain "QR Code" placeholder box, not a scan-
// to-verify URL) — so this is a purely visual, print-time mark, rendered as
// inline SVG at request time (server component) with no client bundle and no
// network round-trip. The `qrcode` package was not already a dependency
// (checked package.json before adding it).
import QRCode from 'qrcode'

/** Renders an inline SVG string encoding `payload` — embed via
 * dangerouslySetInnerHTML inside QrFooterRow's `qr` slot. Payload is just an
 * identifying string (school/exam/student), not a URL — there is nothing to
 * verify against server-side yet. */
export async function renderAuthenticityQr(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: 'svg', margin: 0, width: 84 })
}
