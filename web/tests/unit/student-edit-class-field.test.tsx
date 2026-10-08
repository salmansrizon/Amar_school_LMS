import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileFields } from '@/app/school/students/new/admission-form'
import type { ClassCatalogueRow } from '@/lib/class-catalogue'

// Student edit-profile Class field (grilled explicitly, option A — a
// student-detail follow-up to #621): the edit form's two-select class/
// section cascade is replaced by ONE Class Catalogue-labelled dropdown,
// same shape as every other Offering picker in the app, but still
// submitting a plain class_name/section text pair via hidden inputs —
// updateStudent's own write path is untouched (see admission-form.tsx's own
// doc comment on ProfileFields for why). This proves the wiring: the right
// option renders pre-selected for an existing student, the hidden inputs
// carry the resolved text pair, and the second <select> is genuinely gone.

const classes: ClassCatalogueRow[] = [
  { id: 'off-nine-a-2026', name: 'Nine', section: 'A', group_department: 'Science', shift: 'Morning', academic_year: 2026 },
  { id: 'off-nine-a-2027', name: 'Nine', section: 'A', group_department: 'Science', shift: 'Morning', academic_year: 2027 },
  { id: 'off-six-b', name: 'Six', section: 'B' },
]

describe('ProfileFields edit mode (classes prop) — Class field', () => {
  // The dropdown-to-ComboboxField map (all native <select>s replaced by the
  // shared type-to-filter ui/combobox-field.tsx / ui/select-field.tsx)
  // changed what's observable from a plain `renderToStaticMarkup` call: a
  // native <select> always rendered every <option> into the markup, so the
  // old assertions here could see the *whole* option list without opening
  // anything. ComboboxField's list is portalled and only mounts while its
  // popup is open — nothing this repo's other unit tests do, and no
  // `@testing-library`/jsdom-interaction dependency exists here to open it.
  // What's still genuinely provable via static markup is the *currently
  // resolved* value (rendered as the visible input's `value=`), so these
  // tests select the row under test via `defaults` instead of scanning an
  // always-rendered option list. Full option-list coverage (both Offering
  // rows, unopened) is the admission-form E2E's job, not this unit test's.
  it('renders one dropdown with the full Class Catalogue label, no separate Section select', () => {
    const nine = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={{ class_name: 'Nine', section: 'A' }} />,
    )
    expect(nine).toContain('Nine (Science) - Morning - A')
    const six = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={{ class_name: 'Six', section: 'B' }} />,
    )
    expect(six).toContain('Six - B')
    // One combined Class Catalogue combobox, not a class+section cascade:
    // `section` only ever appears as the hidden input's name, never as a
    // second interactive combobox/select control.
    expect(nine).toContain('id="admission_class_edit"')
    expect(nine).not.toMatch(/role="(combobox|option)"[^>]*name="section"/)
    expect(nine).not.toMatch(/name="section"[^>]*role="(combobox|option)"/)
  })

  it('shows the year segment only when showYear is true', () => {
    const defaults = { class_name: 'Nine', section: 'A' }
    const withoutYear = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={defaults} showYear={false} />,
    )
    const withYear = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={defaults} showYear={true} />,
    )
    expect(withoutYear).toContain('Nine (Science) - Morning - A')
    expect(withoutYear).not.toContain('— 2026')
    expect(withYear).toContain('Nine (Science) - Morning - A — 2026')
  })

  it("pre-selects the option matching the student's current class_name/section, and hidden inputs carry that same pair", () => {
    const html = renderToStaticMarkup(
      <ProfileFields
        lang="en"
        classes={classes}
        defaults={{ class_name: 'Six', section: 'B' }}
        showYear={false}
      />,
    )
    // The combobox's visible input shows the resolved composed label as its
    // value (the id-based option value stays internal to the primitive).
    expect(html).toMatch(/id="admission_class_edit"[^>]*value="Six - B"/)
    expect(html).toContain('<input type="hidden" name="class_name" value="Six"')
    expect(html).toContain('<input type="hidden" name="section" value="B"')
  })

  it('an ambiguous name+section (two Offerings differ only by year) still resolves to the same pre-existing text pair — not a new regression', () => {
    // Both `off-nine-a-2026` and `off-nine-a-2027` share name="Nine" section="A".
    // findClassCatalogueId returns whichever comes first — the same "first
    // match wins" contract this replaced the two-select cascade with, not a
    // capability the old cascade had either.
    const html = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={{ class_name: 'Nine', section: 'A' }} showYear />,
    )
    expect(html).toContain('<input type="hidden" name="class_name" value="Nine"')
    expect(html).toContain('<input type="hidden" name="section" value="A"')
  })

  it('an unset class (no defaults) leaves the dropdown on the "—" placeholder, not a false match', () => {
    const html = renderToStaticMarkup(<ProfileFields lang="en" classes={classes} defaults={{}} />)
    expect(html).toContain('<input type="hidden" name="class_name" value=""')
    expect(html).toContain('<input type="hidden" name="section" value=""')
  })
})
