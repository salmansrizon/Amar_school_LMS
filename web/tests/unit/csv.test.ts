import { describe, it, expect } from 'vitest'
import { csvCell } from '@/lib/csv'

describe('csvCell', () => {
  it('quotes and doubles embedded quotes', () => {
    expect(csvCell('Rahim "Babu" Mia')).toBe('"Rahim ""Babu"" Mia"')
  })
  it('renders null and numbers', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(12)).toBe('"12"')
  })
  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+8801712')).toBe(`"'+8801712"`)
    expect(csvCell('@cmd')).toBe(`"'@cmd"`)
  })
})
