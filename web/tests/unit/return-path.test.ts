import { describe, expect, it } from 'vitest'
import { safeReturnPath } from '@/lib/auth/return-path'

// #538: the permission-denied screen shows where the reader was going, and that
// destination arrives in a query parameter — from the outside.
describe('safeReturnPath', () => {
  it('keeps an ordinary in-app path', () => {
    expect(safeReturnPath('/school/fees')).toBe('/school/fees')
    expect(safeReturnPath('/school/students?class=abc')).toBe('/school/students?class=abc')
  })

  it('drops anything that is not a path', () => {
    expect(safeReturnPath(null)).toBeNull()
    expect(safeReturnPath('')).toBeNull()
    expect(safeReturnPath('school/fees')).toBeNull()
    expect(safeReturnPath('https://evil.example/school')).toBeNull()
    expect(safeReturnPath('javascript:alert(1)')).toBeNull()
  })

  it('drops the two spellings of a protocol-relative URL', () => {
    // Both navigate off-origin in a browser despite starting with "/".
    expect(safeReturnPath('//evil.example/school')).toBeNull()
    expect(safeReturnPath('/\\evil.example/school')).toBeNull()
  })

  it('drops embedded control characters, and trims the harmless trailing ones', () => {
    expect(safeReturnPath('/school/\u0000fees')).toBeNull()
    expect(safeReturnPath('/school/fees\n')).toBe('/school/fees')
  })
})
