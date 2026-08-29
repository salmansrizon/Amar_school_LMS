import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { langCookieAssignment, LANG_COOKIE, type Lang } from '@/lib/i18n'

// #539: "no raw enum, developer key, or mixed-language label appears in
// user-facing content" and "the audit fails CI on a missing key".
//
// A *missing* key cannot happen: the dictionary is typed `{ bn: string; en: string }`
// and `t()` takes a MessageKey, so an absent key or an absent translation is a
// compile error. What types cannot catch is a key that was added in English and
// never translated — an entry whose Bangla is the English string, or has no Bangla
// script in it at all. That is what this reads the source for.
const SOURCE = readFileSync('lib/i18n.ts', 'utf8')

const ENTRY = /'([a-zA-Z0-9_.]+)':\s*\{\s*bn:\s*(['`])((?:\\.|(?!\2)[^\\])*)\2\s*,\s*en:\s*(['`])((?:\\.|(?!\4)[^\\])*)\4/g

/** Entries where Bangla and English are legitimately the same string. */
const ACRONYMS = new Set(['schools.eiin', 'sa.flags.sms', 'markSheet.gpa'])

function entries() {
  const out: { key: string; bn: string; en: string }[] = []
  ENTRY.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ENTRY.exec(SOURCE))) out.push({ key: m[1], bn: m[3], en: m[5] })
  return out
}

describe('the dictionary is actually translated (#539)', () => {
  const all = entries()

  it('parses the dictionary, so a silent regex failure cannot make this vacuous', () => {
    expect(all.length).toBeGreaterThan(1500)
  })

  it('has no entry whose Bangla is just the English', () => {
    const untranslated = all.filter((e) => e.bn === e.en && !ACRONYMS.has(e.key)).map((e) => e.key)
    expect(untranslated, `add a Bangla translation, or list it as an acronym:\n${untranslated.join('\n')}`).toEqual([])
  })

  it('has no Bangla value written in Latin script', () => {
    const latin = all
      .filter((e) => !ACRONYMS.has(e.key) && !/[ঀ-৿]/.test(e.bn) && /[A-Za-z]{3}/.test(e.bn))
      .map((e) => e.key)
    expect(latin, `Bangla value contains no Bangla:\n${latin.join('\n')}`).toEqual([])
  })

  it('keeps the acronym allowlist honest — every entry on it is still identical', () => {
    for (const key of ACRONYMS) {
      const entry = all.find((e) => e.key === key)
      expect(entry, `${key} is allowlisted but no longer exists`).toBeDefined()
      expect(entry!.bn, `${key} now differs, so remove it from the allowlist`).toBe(entry!.en)
    }
  })
})

describe('the language choice survives the login bounce (#539)', () => {
  const original = process.env.NEXT_PUBLIC_ROOT_DOMAIN

  const assignment = (lang: Lang, host: string, root = 'edumebd.com') => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = root
    const value = langCookieAssignment(lang, host)
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = original
    return value
  }

  // The actual defect: without a domain the preference is host-only, so a user who
  // picks English on the apex and is bounced to <slug>.<root> — which is what login
  // does — arrives on a Bangla page.
  it('is scoped to the root domain, not to the host that set it', () => {
    expect(assignment('en', 'edumebd.com')).toContain('domain=.edumebd.com')
    expect(assignment('en', 'adarshamodelschool.edumebd.com')).toContain('domain=.edumebd.com')
  })

  it('stays host-only where there is no root domain to widen to', () => {
    expect(assignment('en', 'localhost:3000', 'localhost:3000')).not.toContain('domain=')
    expect(assignment('en', 'someone-else.com')).not.toContain('domain=')
  })

  it('is Secure except on loopback', () => {
    expect(assignment('bn', 'edumebd.com')).toContain('secure')
    expect(assignment('bn', 'localhost:3000', 'localhost:3000')).not.toContain('secure')
  })

  it('persists for a year and carries the expected name', () => {
    const value = assignment('en', 'edumebd.com')
    expect(value.startsWith(`${LANG_COOKIE}=en`)).toBe(true)
    expect(value).toContain('max-age=31536000')
    expect(value).toContain('samesite=lax')
  })
})
