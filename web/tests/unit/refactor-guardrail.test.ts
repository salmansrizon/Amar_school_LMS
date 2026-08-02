// Refactor guardrail EXEMPLAR for map #258 (ADR 0008 §5).
//
// Before any #258 phase moves existing logic into the new modules/<domain>
// structure, its current behavior must be pinned by a characterization test so
// the move is provably behavior-preserving. This file is the worked reference:
// it pins `takaInWords` (pure money-to-words domain logic that will migrate into
// a finance domain module during #266) exactly as it behaves today. If a later
// refactor changes any assertion here, the refactor changed behavior and must
// be reworked or split into an explicit behavior-change ticket.
import { describe, expect, it } from 'vitest'
import { takaInWords } from '@/lib/amount-words'

describe('refactor guardrail: takaInWords current behavior (pin before #266 move)', () => {
  it.each([
    [0, 'Zero Taka Only'],
    [42, 'Forty Two Taka Only'],
    [1000, 'One Thousand Taka Only'],
    [100000, 'One Lakh Taka Only'],
    [12345678, 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Taka Only'],
  ])('%d → %s', (amount, words) => {
    expect(takaInWords(amount as number)).toBe(words)
  })

  it('pins Bangladeshi lakh/crore grouping + paisa fraction', () => {
    expect(takaInWords(2550000)).toBe('Twenty Five Lakh Fifty Thousand Taka Only')
    expect(takaInWords(500.5)).toBe('Five Hundred Taka and Fifty Paisa Only')
  })
})
