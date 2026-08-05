import { describe, it, expect } from 'vitest'
import { extractPlaceholders } from '@/lib/super-admin/notification-templates'

describe('extractPlaceholders', () => {
  it('collects {{vars}} from title + body, deduped, in first-seen order', () => {
    expect(extractPlaceholders('Invoice {{number}}', 'Invoice {{number}} — {{total}} due')).toEqual([
      'number',
      'total',
    ])
  })
  it('is empty when there are no placeholders', () => {
    expect(extractPlaceholders('Hello', 'No vars here')).toEqual([])
  })
  it('ignores malformed braces', () => {
    expect(extractPlaceholders('{{ bad}} {notreal}', '{{good}}')).toEqual(['good'])
  })
})
