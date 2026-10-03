import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatMoney, formatNumber, formatTime } from '@/lib/i18n'
import { formatTaka } from '@/lib/money'

describe('formatMoney', () => {
  it("uses lakh grouping and the reader's digits", () => {
    expect(formatMoney(1395000, 'bn')).toBe('৳১৩,৯৫,০০০')
    expect(formatMoney(1395000, 'en')).toBe('৳13,95,000')
  })
  it('shows decimals only for paisa', () => {
    expect(formatMoney(500, 'en')).toBe('৳500')
    expect(formatMoney(500.5, 'en')).toBe('৳500.5')
    expect(formatMoney(500.5, 'bn')).toBe('৳৫০০.৫')
  })
  it('formatTaka with lang routes through it; without lang keeps legacy 2dp', () => {
    expect(formatTaka(50000, 'bn')).toBe('৳৫০০')
    expect(formatTaka(50000)).toBe('৳500.00')
  })
})

describe('formatNumber', () => {
  it('bn gets Bangla digits, en Latin', () => {
    expect(formatNumber(275, 'bn')).toBe('২৭৫')
    expect(formatNumber(275, 'en')).toBe('275')
  })
  it('identifiers are strings and never go through it', () => {
    const mobile = '01712345678'
    expect(String(mobile)).toBe('01712345678')
  })
})

describe('formatDate / time', () => {
  const d = '2026-10-03T02:58:00Z' // 08:58 in Dhaka
  it('table style', () => {
    expect(formatDate(d, 'bn')).toBe('৩ অক্টো ২০২৬')
    expect(formatDate(d, 'en')).toBe('3 Oct 2026')
  })
  it('form style is dd/mm/yyyy', () => {
    expect(formatDate(d, 'bn', 'form')).toBe('০৩/১০/২০২৬')
    expect(formatDate(d, 'en', 'form')).toBe('03/10/2026')
  })
  it('date-only strings keep their day', () => {
    expect(formatDate('2026-10-03', 'en')).toBe('3 Oct 2026')
  })
  it('time and datetime', () => {
    expect(formatTime(d, 'bn')).toBe('৮:৫৮ AM')
    expect(formatTime(d, 'en')).toBe('8:58 AM')
    expect(formatDateTime(d, 'en')).toBe('3 Oct 2026, 8:58 AM')
  })
  it('bad input gives an empty string', () => {
    expect(formatDate('nope', 'en')).toBe('')
  })
})
