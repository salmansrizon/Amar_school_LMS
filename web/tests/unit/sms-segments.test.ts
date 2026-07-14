import { describe, it, expect } from 'vitest'
import { countSmsSegments } from '@/lib/sms/segments'

// SMS segment math (issue #36, PRD §5.7): GSM-7 160/153, UCS-2 (Bangla/any
// non-GSM-7 text) 70/67. Kept pure so the compose live-counter and the log's
// stored segment totals use the exact same rule.
describe('countSmsSegments', () => {
  it('an empty message needs 0 segments', () => {
    expect(countSmsSegments('')).toEqual({ length: 0, encoding: 'gsm7', encodedLength: 0, segments: 0 })
  })

  it('plain GSM-7 text under 160 chars is a single segment', () => {
    const info = countSmsSegments('School reopens tomorrow at 9am.')
    expect(info.encoding).toBe('gsm7')
    expect(info.segments).toBe(1)
  })

  it('exactly 160 GSM-7 chars is still a single segment', () => {
    const text = 'a'.repeat(160)
    expect(countSmsSegments(text).segments).toBe(1)
  })

  it('161 GSM-7 chars concatenates at 153/segment (2 segments)', () => {
    const text = 'a'.repeat(161)
    const info = countSmsSegments(text)
    expect(info.encoding).toBe('gsm7')
    expect(info.segments).toBe(2)
  })

  it('306 GSM-7 chars (2 * 153) is exactly 2 segments, 307 needs 3', () => {
    expect(countSmsSegments('a'.repeat(306)).segments).toBe(2)
    expect(countSmsSegments('a'.repeat(307)).segments).toBe(3)
  })

  it('GSM-7 extension characters (e.g. "{") count as 2 units toward the limit', () => {
    // 159 plain + 1 extension char = 160 plain-equivalent units + 1 extra = 161 -> 2 segments
    const text = 'a'.repeat(159) + '{'
    const info = countSmsSegments(text)
    expect(info.encoding).toBe('gsm7')
    expect(info.encodedLength).toBe(161)
    expect(info.segments).toBe(2)
  })

  it('Bangla (or any non-GSM-7) text forces UCS-2 with a 70-char single segment', () => {
    const info = countSmsSegments('আগামীকাল বার্ষিক ক্রীড়া প্রতিযোগিতার কারণে বিদ্যালয় সকাল ৯টায় শুরু হবে।')
    expect(info.encoding).toBe('ucs2')
    expect(info.segments).toBe(2) // > 70 chars
  })

  it('exactly 70 Bangla chars is a single UCS-2 segment', () => {
    const text = 'ক'.repeat(70)
    expect(countSmsSegments(text)).toMatchObject({ encoding: 'ucs2', segments: 1 })
  })

  it('71 Bangla chars concatenates at 67/segment (2 segments)', () => {
    const text = 'ক'.repeat(71)
    expect(countSmsSegments(text).segments).toBe(2)
  })

  it('a single stray Unicode character anywhere flips the whole message to UCS-2', () => {
    const info = countSmsSegments('Reminder: PTA meeting Saturday — বাবা-মা আমন্ত্রিত')
    expect(info.encoding).toBe('ucs2')
  })
})
