import { describe, expect, it } from 'vitest'
import { shouldHandleShortcut } from '@/components/data-table/shortcuts'
import { parseShortcutsEnabled, shortcutsCookieAssignment } from '@/lib/ui-prefs'

const on = { enabled: true }
const body = { tagName: 'BODY', isContentEditable: false }

describe('shouldHandleShortcut (map 013, F6)', () => {
  it('fires / as search and f/F as filter', () => {
    expect(shouldHandleShortcut({ key: '/', target: body }, on)).toBe('search')
    expect(shouldHandleShortcut({ key: 'f', target: body }, on)).toBe('filter')
    expect(shouldHandleShortcut({ key: 'F', target: body }, on)).toBe('filter')
    expect(shouldHandleShortcut({ key: 'g', target: body }, on)).toBeNull()
  })

  it('ignores typing in inputs, textareas, selects and contentEditable', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(shouldHandleShortcut({ key: '/', target: { tagName } }, on)).toBeNull()
    }
    expect(shouldHandleShortcut({ key: 'f', target: { tagName: 'DIV', isContentEditable: true } }, on)).toBeNull()
  })

  it('ignores IME composition (Bangla input methods)', () => {
    expect(shouldHandleShortcut({ key: 'f', isComposing: true, target: body }, on)).toBeNull()
    expect(shouldHandleShortcut({ key: 'f', keyCode: 229, target: body }, on)).toBeNull()
  })

  it('ignores presses with Ctrl, Meta or Alt held', () => {
    expect(shouldHandleShortcut({ key: 'f', ctrlKey: true, target: body }, on)).toBeNull()
    expect(shouldHandleShortcut({ key: 'f', metaKey: true, target: body }, on)).toBeNull()
    expect(shouldHandleShortcut({ key: '/', altKey: true, target: body }, on)).toBeNull()
  })

  it('does nothing when turned off or a dialog is open', () => {
    expect(shouldHandleShortcut({ key: '/', target: body }, { enabled: false })).toBeNull()
    expect(shouldHandleShortcut({ key: '/', target: body }, { enabled: true, dialogOpen: true })).toBeNull()
  })
})

describe('shortcuts preference cookie', () => {
  it('defaults on; only an explicit 0 turns it off', () => {
    expect(parseShortcutsEnabled(undefined)).toBe(true)
    expect(parseShortcutsEnabled('junk')).toBe(true)
    expect(parseShortcutsEnabled('0')).toBe(false)
    expect(shortcutsCookieAssignment(false)).toMatch(/^asm-shortcuts=0;path=\//)
  })
})
