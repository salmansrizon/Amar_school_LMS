import { describe, it, expect } from 'vitest'
import { takaInWords } from '@/lib/amount-words'

// Receipt amounts render in words with Bangladeshi (lakh/crore) numbering.
describe('takaInWords', () => {
  it.each([
    [0, 'Zero Taka Only'],
    [1, 'One Taka Only'],
    [19, 'Nineteen Taka Only'],
    [42, 'Forty Two Taka Only'],
    [100, 'One Hundred Taka Only'],
    [512, 'Five Hundred Twelve Taka Only'],
    [1000, 'One Thousand Taka Only'],
    [2026, 'Two Thousand Twenty Six Taka Only'],
    [99999, 'Ninety Nine Thousand Nine Hundred Ninety Nine Taka Only'],
    [100000, 'One Lakh Taka Only'],
    [2550000, 'Twenty Five Lakh Fifty Thousand Taka Only'],
    [10000000, 'One Crore Taka Only'],
    [12345678, 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Taka Only'],
  ])('%d → %s', (amount, words) => {
    expect(takaInWords(amount)).toBe(words)
  })

  it('renders paisa for fractional amounts', () => {
    expect(takaInWords(500.5)).toBe('Five Hundred Taka and Fifty Paisa Only')
    expect(takaInWords(0.05)).toBe('Zero Taka and Five Paisa Only')
  })

  it('is exact on IEEE754-hostile fractions', () => {
    expect(takaInWords(1.005)).toBe('One Taka and One Paisa Only')
    expect(takaInWords(0.1 + 0.2)).toBe('Zero Taka and Thirty Paisa Only')
  })

  it('rejects negatives', () => {
    expect(() => takaInWords(-1)).toThrow()
  })
})
