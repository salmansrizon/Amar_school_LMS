import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@/components/markdown'
import { fencedBlock, indentTwo, inFence, linkSelection, prefixLines, softBreaksToHard, wrapSelection } from '@/lib/rich-text'

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />)

describe('Markdown', () => {
  it('renders bold, headings, lists and code blocks', () => {
    const out = html('## Big\n\n**bold**\n\n- a\n- b\n\n```\nlet x = 1\n```')
    expect(out).toContain('<h3')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<ul')
    expect(out).toContain('<pre')
    expect(out).toContain('let x = 1')
    expect(out).toContain('overflow-x-auto')
  })
  it('shows a script tag and raw html as text', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;script&gt;')
  })
  it('does not link javascript: urls and keeps safe ones hardened', () => {
    expect(html('[x](javascript:alert(1))')).not.toContain('<a')
    const ok = html('[x](https://example.com)')
    expect(ok).toContain('href="https://example.com"')
    expect(ok).toContain('rel="noopener noreferrer nofollow"')
    expect(html('[m](mailto:a@b.co)')).toContain('mailto:a@b.co')
    expect(html('[d](data:text/html,hi)')).not.toContain('<a')
  })
  it('never renders an image element', () => {
    const out = html('![cat](https://evil.example/c.png)')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('evil.example')
    expect(out).toContain('cat')
  })
  it('keeps the line breaks of old plain text', () => {
    expect(html('one\ntwo\nthree')).toContain('one<br/>')
    expect(html('one\ntwo')).toContain('<br/>')
  })
  // A textarea sent in a form reaches the server with CRLF line ends; the
  // stored text must render exactly like the editor's preview (LF).
  it('renders CRLF text the same as LF text', () => {
    const lf = 'one\ntwo\n\n- a\n- b\n\n```\nx\ny\n```'
    expect(html(lf.replace(/\n/g, '\r\n'))).toBe(html(lf))
  })
})

describe('softBreaksToHard', () => {
  it('breaks single newlines outside fences only', () => {
    const out = softBreaksToHard('a\nb\n\n```\nx\ny\n```\nc')
    expect(out).toBe('a  \nb\n\n```\nx\ny\n```\nc')
  })
})

describe('toolbar transforms', () => {
  it('wraps a selection and selects it', () => {
    const e = wrapSelection('hello world', 6, 11, '**')
    expect(e).toEqual({ value: 'hello **world**', start: 8, end: 13 })
  })
  it('inserts a placeholder when nothing is selected', () => {
    expect(wrapSelection('', 0, 0, '`', '`', 'code').value).toBe('`code`')
  })
  it('prefixes every touched line, numbered', () => {
    const e = prefixLines('a\nb\nc', 0, 3, (i) => `${i + 1}. `)
    expect(e.value).toBe('1. a\n2. b\nc')
    expect(prefixLines('x\nyz', 3, 3, () => '## ').value).toBe('x\n## yz')
  })
  it('fences with blank lines around', () => {
    expect(fencedBlock('before after', 7, 12).value).toBe('before \n\n```\nafter\n```')
    expect(fencedBlock('a', 1, 1, 'code').value).toBe('a\n\n```\ncode\n```')
    expect(fencedBlock('', 0, 0).value).toBe('```\n\n```')
  })
  it('makes a link with the url selected', () => {
    const e = linkSelection('see docs', 4, 8)
    expect(e.value).toBe('see [docs](https://)')
    expect(e.value.slice(e.start, e.end)).toBe('https://')
  })
  it('knows when the caret is inside a fence, and indents by two', () => {
    const v = '```\nx\n'
    expect(inFence(v, v.length)).toBe(true)
    expect(inFence('```\nx\n```\ny', 11)).toBe(false)
    expect(indentTwo('ab', 1, 1)).toEqual({ value: 'a  b', start: 3, end: 3 })
  })
})
