// Pure text transforms behind RichTextField's toolbar, and the line-break rule
// the Markdown renderer uses. Every transform takes the textarea's value and
// selection and returns the new value and selection, so none of it needs a DOM.

export interface Edit {
  value: string
  start: number
  end: number
}

/** Wrap the selection (or a placeholder when empty) and select what was wrapped. */
export function wrapSelection(value: string, start: number, end: number, before: string, after = before, placeholder = ''): Edit {
  const inner = value.slice(start, end) || placeholder
  const out = value.slice(0, start) + before + inner + after + value.slice(end)
  return { value: out, start: start + before.length, end: start + before.length + inner.length }
}

/** Prefix every line the selection touches. `prefix` gets the 0-based line index. */
export function prefixLines(value: string, start: number, end: number, prefix: (i: number) => string): Edit {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const nl = value.indexOf('\n', end)
  const to = nl === -1 ? value.length : nl
  const lines = value.slice(from, to).split('\n')
  const changed = lines.map((l, i) => prefix(i) + l).join('\n')
  return { value: value.slice(0, from) + changed + value.slice(to), start: from, end: from + changed.length }
}

/** A fenced code block with a blank line before and after; selects the code. */
export function fencedBlock(value: string, start: number, end: number, placeholder = ''): Edit {
  const code = value.slice(start, end) || placeholder
  const head = value.slice(0, start)
  const tail = value.slice(end)
  const lead = head === '' || head.endsWith('\n\n') ? '' : head.endsWith('\n') ? '\n' : '\n\n'
  const trail = tail === '' || tail.startsWith('\n\n') ? '' : tail.startsWith('\n') ? '\n' : '\n\n'
  const open = `${lead}\`\`\`\n`
  const out = head + open + code + '\n```' + trail + tail
  const s = head.length + open.length
  return { value: out, start: s, end: s + code.length }
}

/** `[text](https://)` with the URL selected, ready to be typed over. */
export function linkSelection(value: string, start: number, end: number, placeholder = ''): Edit {
  const text = value.slice(start, end) || placeholder
  const url = 'https://'
  const out = `${value.slice(0, start)}[${text}](${url})${value.slice(end)}`
  const s = start + text.length + 3
  return { value: out, start: s, end: s + url.length }
}

/** Is `pos` inside an unclosed ``` fence? Counts fence lines before it. */
export function inFence(value: string, pos: number): boolean {
  const before = value.slice(0, pos).split('\n')
  // The line the caret is on counts only if it is already a complete fence line above it.
  return before.slice(0, -1).filter((l) => /^\s*```/.test(l)).length % 2 === 1
}

/** Insert two spaces at the caret (Tab inside a code fence). */
export function indentTwo(value: string, start: number, end: number): Edit {
  return { value: value.slice(0, start) + '  ' + value.slice(end), start: start + 2, end: start + 2 }
}

/** Old questions are plain text with single newlines the Student meant. CommonMark
 *  folds those into a space, so turn them into hard breaks, outside code fences. */
export function softBreaksToHard(md: string): string {
  // Text posted from a <textarea> in a form arrives with CRLF line ends. A
  // stray \r before the added spaces reads as a blank line (a new paragraph).
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let fenced = false
  return lines
    .map((line, i) => {
      const isFence = /^\s*```/.test(line)
      const wasFenced = fenced
      if (isFence) fenced = !fenced
      const next = lines[i + 1]
      if (wasFenced || isFence || fenced) return line
      if (next === undefined || !line.trim() || !next.trim() || /^\s*```/.test(next)) return line
      return line.endsWith('  ') ? line : line + '  '
    })
    .join('\n')
}

/** One-line plain text for previews and table cells: Markdown marks removed,
 *  link text kept, whitespace collapsed. Text that never used Markdown (a lone
 *  `*`, `#১`, `৫ * ৩`) passes through unchanged. Numbered-list numbers are kept. */
export function markdownToPlainText(text: string): string {
  return text
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, '$1')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
