import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@/components/markdown'
import { markdownToPlainText as plain } from '@/lib/rich-text'

describe('markdownToPlainText', () => {
  it('strips each construct', () => {
    expect(plain('**bold** and *it* and `code`')).toBe('bold and it and code')
    expect(plain('## Heading\n\ntext')).toBe('Heading text')
    expect(plain('- a\n- b\n* c')).toBe('a b c')
    expect(plain('> quoted')).toBe('quoted')
    expect(plain('```js\nlet x = 1\n```')).toBe('let x = 1')
    expect(plain('see [the docs](https://e.com) now')).toBe('see the docs now')
    expect(plain('![alt](https://e.com/x.png)')).toBe('alt')
  })
  it('keeps old plain text unchanged', () => {
    for (const s of ['৫ * ৩ = ১৫', '#১ নম্বর প্রশ্ন', 'আমি বুঝিনি, দয়া করে বলুন?', 'a * b * c', '3 * 4 = 12', 'price: ৳500 (approx)', '1. first', 'snake_case_name'])
      expect(plain(s)).toBe(s)
  })
  it('collapses whitespace', () => {
    expect(plain('line one\n\n  line   two ')).toBe('line one line two')
  })
})

describe('reply display (Markdown) with old and hostile text', () => {
  const html = (t: string) => renderToStaticMarkup(<Markdown text={t} />)
  it('renders old plain text with line breaks kept', () => {
    const out = html('প্রথম লাইন\nদ্বিতীয় লাইন ৫ * ৩')
    expect(out).toContain('প্রথম লাইন')
    expect(out).toContain('<br')
    expect(out).toContain('৫ * ৩')
  })
  it('keeps the three attack strings inert', () => {
    const out = html('<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n[x](javascript:alert(1))')
    expect(out).not.toMatch(/<script|<img|<a |href="javascript/i)
    expect(plain('[x](javascript:alert(1))')).toBe('x')
  })
})
