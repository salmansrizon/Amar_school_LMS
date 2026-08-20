// Structural guard for the shell/page width contract (map #370, ticket #397).
// components/app-shell.tsx renders the single <main> landmark and owns width/
// padding for every /school page (contentContainer=true) — see the doc comment
// atop components/ui/page.tsx. A page that nests its own <main> duplicates that
// landmark (an a11y fault) and, in every case found so far, re-caps the width
// the shell already handed it. The rule was previously enforced only by
// convention and a comment in app/school/layout.tsx; 21 pages had drifted from
// it silently by the time #397 found them. This test makes the contract fail
// loudly instead.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SCHOOL_APP_DIR = path.resolve(__dirname, '../../app/school')

// Print routes keep their own A4 layout and are exempt (ADR 0007) — detected by
// the PrintPage/PrintButton markers every printable page in this codebase
// wraps its content in, not by guessing from the file path. Deliberately NOT
// "imports anything from components/print/" — several ordinary screen pages
// (e.g. exams/result-inquiry, exams/[id]/result-book) import the shared
// Badge atom from components/print/pieces without being print pages at all;
// a bare directory-prefix match would wrongly exempt them.
const PRINT_MARKERS = ['PrintPage', 'PrintButton']

function isPrintExempt(source: string): boolean {
  return PRINT_MARKERS.some((marker) => source.includes(marker))
}

// Doc comments in this codebase discuss "<main>" as prose (the kit's own
// header comment does exactly that) — strip comments before scanning for a
// real JSX tag, or those false-positive.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function findPageFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...findPageFiles(full))
    } else if (entry === 'page.tsx') {
      found.push(full)
    }
  }
  return found
}

describe('school page shell contract (#397)', () => {
  const pageFiles = findPageFiles(SCHOOL_APP_DIR)

  it('found page.tsx files to check (sanity check the walk itself works)', () => {
    expect(pageFiles.length).toBeGreaterThan(50)
  })

  it('no non-print /school page nests its own <main> landmark inside the shell\'s', () => {
    const violations: string[] = []
    for (const file of pageFiles) {
      const source = readFileSync(file, 'utf8')
      if (isPrintExempt(source)) continue
      if (/<main[\s>]/.test(stripComments(source))) {
        violations.push(path.relative(SCHOOL_APP_DIR, file))
      }
    }
    expect(violations).toEqual([])
  })
})
