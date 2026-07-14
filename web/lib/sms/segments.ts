// SMS segment math (PRD §5.7). Kept pure/framework-free so it can run
// identically on the client (live counter while composing) and the server
// (segment totals persisted to sms_log for the date-range log report).
//
// GSM-7 (the default SMS alphabet): 160 chars in a single segment, 153/segment
// once the message needs to be concatenated across more than one segment.
// Any character outside the GSM-7 default+extension tables (this is how
// Bangla/Unicode text is detected — there's no separate "is this Bangla"
// check elsewhere in the codebase, so this doubles as that check) forces the
// whole message to UCS-2 encoding: 70 chars single-segment, 67/segment
// concatenated. A handful of GSM-7 "extension table" characters (e.g. € { })
// require an escape code and count as 2 characters each toward the GSM-7 limit.

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM7_EXTENDED = '^{}\\[~]|€'

const GSM7_SET = new Set(GSM7_BASIC)
const GSM7_EXT_SET = new Set(GSM7_EXTENDED)

export type SmsEncoding = 'gsm7' | 'ucs2'

export interface SmsSegmentInfo {
  /** Raw character count (what the user sees as "72/160"). */
  length: number
  encoding: SmsEncoding
  /** Encoded-unit length: GSM-7 extension characters count as 2 units each;
   *  UCS-2 counts UTF-16 code units (matches real SMS UCS-2 unit counting). */
  encodedLength: number
  /** 0 for an empty message, otherwise the number of SMS segments required. */
  segments: number
}

const LIMITS: Record<SmsEncoding, { single: number; concat: number }> = {
  gsm7: { single: 160, concat: 153 },
  ucs2: { single: 70, concat: 67 },
}

function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_SET.has(ch) && !GSM7_EXT_SET.has(ch)) return false
  }
  return true
}

function gsm7EncodedLength(text: string): number {
  let units = 0
  for (const ch of text) units += GSM7_EXT_SET.has(ch) ? 2 : 1
  return units
}

export function countSmsSegments(text: string): SmsSegmentInfo {
  const encoding: SmsEncoding = text.length === 0 || isGsm7(text) ? 'gsm7' : 'ucs2'
  const encodedLength = encoding === 'gsm7' ? gsm7EncodedLength(text) : text.length
  const { single, concat } = LIMITS[encoding]
  const segments = encodedLength === 0 ? 0 : encodedLength <= single ? 1 : Math.ceil(encodedLength / concat)
  return { length: text.length, encoding, encodedLength, segments }
}
