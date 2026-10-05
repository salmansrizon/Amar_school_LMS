'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Bold, Code, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Quote, SquareCode } from 'lucide-react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { Markdown } from '@/components/markdown'
import {
  fencedBlock,
  indentTwo,
  inFence,
  linkSelection,
  prefixLines,
  wrapSelection,
  type Edit,
} from '@/lib/rich-text'

// A real <textarea> holding Markdown, with a toolbar that edits the selection
// and a Write | Preview switch. The textarea stays in the DOM (hidden while
// previewing) so the form, `required` validation and no-JS submit are native.
// Remount with a new `key` to clear it after a send.
// ponytail: controlled value, so toolbar edits are not in the browser's undo
// stack. Upgrade: execCommand('insertText') if students ask for Ctrl+Z.


type EditFn = (v: string, s: number, e: number, lang: Lang) => Edit
const EDITS: Record<string, EditFn> = {
  bold: (v, s, e, l) => wrapSelection(v, s, e, '**', '**', t('student.editor.bold', l)),
  italic: (v, s, e, l) => wrapSelection(v, s, e, '*', '*', t('student.editor.italic', l)),
  h2: (v, s, e) => prefixLines(v, s, e, () => '## '),
  h3: (v, s, e) => prefixLines(v, s, e, () => '### '),
  ul: (v, s, e) => prefixLines(v, s, e, () => '- '),
  ol: (v, s, e) => prefixLines(v, s, e, (i) => `${i + 1}. `),
  quote: (v, s, e) => prefixLines(v, s, e, () => '> '),
  code: (v, s, e) => wrapSelection(v, s, e, '`', '`', 'code'),
  block: (v, s, e) => fencedBlock(v, s, e, 'code'),
  link: (v, s, e, l) => linkSelection(v, s, e, t('student.editor.link', l)),
}
const TOOLS: { key: string; label: MessageKey; icon: React.ReactNode }[] = [
  { key: 'bold', label: 'student.editor.bold', icon: <Bold /> },
  { key: 'italic', label: 'student.editor.italic', icon: <Italic /> },
  { key: 'h2', label: 'student.editor.headingLarge', icon: <Heading2 /> },
  { key: 'h3', label: 'student.editor.headingMedium', icon: <Heading3 /> },
  { key: 'ul', label: 'student.editor.bullets', icon: <List /> },
  { key: 'ol', label: 'student.editor.numbers', icon: <ListOrdered /> },
  { key: 'quote', label: 'student.editor.quote', icon: <Quote /> },
  { key: 'code', label: 'student.editor.code', icon: <Code /> },
  { key: 'block', label: 'student.editor.codeBlock', icon: <SquareCode /> },
  { key: 'link', label: 'student.editor.link', icon: <LinkIcon /> },
]

export function RichTextField({
  name,
  label,
  lang,
  rows = 5,
  required = true,
  formal = false,
  defaultValue = '',
  onValue,
}: {
  name: string
  label: string
  lang: Lang
  rows?: number
  required?: boolean
  /** Owner / teacher portal: use the formal (আপনি) Write label and hint. */
  formal?: boolean
  /** Text to start with (an edit form). */
  defaultValue?: string
  onValue?: (v: string) => void
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const sel = useRef<{ start: number; end: number } | null>(null)
  const escaped = useRef(false)
  const [value, setValue] = useState(defaultValue)
  const [mode, setMode] = useState<'write' | 'preview'>('write')

  useLayoutEffect(() => {
    const el = ref.current
    if (el && sel.current) {
      el.focus()
      el.setSelectionRange(sel.current.start, sel.current.end)
      sel.current = null
    }
  }, [value])

  const change = (v: string) => {
    setValue(v)
    onValue?.(v)
  }
  const apply = (fn: (v: string, s: number, e: number) => Edit) => {
    const el = ref.current
    if (!el) return
    const edit = fn(el.value, el.selectionStart, el.selectionEnd)
    sel.current = { start: edit.start, end: edit.end }
    change(edit.value)
  }

  const act = (key: string) => apply((v, st, en) => EDITS[key](v, st, en, lang))
  const tools = TOOLS.map((x) => ({ ...x, label: t(x.label, lang) }))

  const tab = (m: 'write' | 'preview', disabled = false) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${m}`}
      aria-selected={mode === m}
      aria-controls={`${id}-panel`}
      disabled={disabled}
      onClick={() => setMode(m)}
      className={`h-11 rounded-full px-4 text-xs font-semibold sm:h-8 ${
        mode === m ? 'bg-brand-500 text-white' : 'bg-paper-muted text-ink hover:bg-line'
      } disabled:opacity-50`}
    >
      {t(m === 'write' && formal ? 'editor.write' : `student.editor.${m}`, lang)}
    </button>
  )

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${id}-ta`} className="text-xs font-semibold text-muted">
          {label}
        </label>
        <div role="tablist" aria-label={label} className="flex gap-1">
          {tab('write')}
          {tab('preview', !value.trim())}
        </div>
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}`} className="min-w-0">
        {mode === 'write' && (
          <div role="toolbar" aria-label={t('student.editor.toolbar', lang)} className="mb-1 flex flex-wrap gap-1">
            {tools.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-label={x.label}
                title={x.label}
                // Keep the textarea's selection: a mouse press must not steal focus.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => act(x.key)}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border border-line-strong bg-paper text-ink hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:size-8 [&_svg]:size-4"
              >
                {x.icon}
              </button>
            ))}
          </div>
        )}
        <textarea
          id={`${id}-ta`}
          ref={ref}
          name={name}
          required={required}
          rows={rows}
          value={value}
          hidden={mode === 'preview'}
          aria-describedby={`${id}-hint`}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            const el = e.currentTarget
            const mod = e.metaKey || e.ctrlKey
            if (mod && !e.altKey && !e.shiftKey && ['b', 'i', 'e'].includes(e.key.toLowerCase())) {
              e.preventDefault()
              const k = e.key.toLowerCase()
              return act(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'code')
            }
            if (e.key === 'Escape' && inFence(el.value, el.selectionStart) && !escaped.current) {
              // First Escape only releases the Tab trap; it must not close a dialog.
              e.preventDefault()
              escaped.current = true
              return
            }
            if (e.key === 'Tab' && !e.shiftKey && !escaped.current && inFence(el.value, el.selectionStart)) {
              e.preventDefault()
              return apply(indentTwo)
            }
            if (e.key !== 'Escape' && e.key !== 'Tab') escaped.current = false
          }}
          className="w-full rounded-sm border border-line-strong bg-paper p-2 text-sm"
        />
        {mode === 'preview' && (
          <div className="min-h-24 rounded-sm border border-line bg-paper p-3">
            <Markdown text={value} />
          </div>
        )}
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted">
        {t(formal ? 'editor.hint' : 'student.editor.hint', lang)}
      </p>
    </div>
  )
}
