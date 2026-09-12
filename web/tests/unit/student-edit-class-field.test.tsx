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
  it('renders one dropdown with the full Class Catalogue label, no separate Section select', () => {
    const html = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={{}} />,
    )
    expect(html).toContain('Nine (Science) - Morning - A')
    expect(html).toContain('Six - B')
    // Only one <select> renders for Class — the old two-select cascade's
    // second dropdown is gone. `section` still appears, but only as the
    // hidden input's name, never a second <select>.
    expect(html.match(/<select/g)).toHaveLength(3) // gender, class, guardian_relation
    expect(html).not.toMatch(/<select[^>]*name="section"/)
  })

  it('shows the year segment only when showYear is true', () => {
    const withoutYear = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={{}} showYear={false} />,
    )
    const withYear = renderToStaticMarkup(
      <ProfileFields lang="en" classes={classes} defaults={{}} showYear={true} />,
    )
    expect(withoutYear).not.toContain('— 2026')
    expect(withYear).toContain('Nine (Science) - Morning - A — 2026')
    expect(withYear).toContain('Nine (Science) - Morning - A — 2027')
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
    // React SSR marks the matching <option> of a controlled <select> as selected.
    expect(html).toMatch(/<option[^>]*value="off-six-b"[^>]*selected[^>]*>Six - B<\/option>/)
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
