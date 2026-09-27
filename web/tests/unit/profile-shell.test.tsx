import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { User } from 'lucide-react'
import { ProfileAside, ProfileField, ProfileHeader, ProfileSection } from '@/components/ui/profile'

// Shared profile-detail shell (student + employee person pages, map
// owner-ui-overhaul). ProfileSection's `cols` prop branches between a field
// grid (with hairline column dividers at @4xl) and a flow layout for
// non-grid content (e.g. Benefit Flags chips) — that branch, and
// ProfileField's empty-value fallback, are exactly the kind of logic
// ponytail says needs one runnable check.

describe('ProfileSection cols branch', () => {
  it('renders a dt/dd field grid for a numeric cols value', () => {
    const html = renderToStaticMarkup(
      <ProfileSection icon={User} title="Identity" cols={4}>
        <ProfileField label="Full name" value="Hasibul Islam" />
      </ProfileSection>,
    )
    expect(html).toContain('<dl')
    expect(html).toContain('grid-cols-4')
    expect(html).not.toContain('flex-wrap')
  })

  it("renders a flex-wrap flow layout for cols='flow', skipping the grid", () => {
    const html = renderToStaticMarkup(
      <ProfileSection icon={User} title="Benefit Flags" cols="flow">
        <span>Indigenous</span>
      </ProfileSection>,
    )
    expect(html).not.toContain('<dl')
    expect(html).toContain('flex-wrap')
  })
})

describe('ProfileField empty value', () => {
  it('falls back to an em dash when value is null/undefined', () => {
    const html = renderToStaticMarkup(<ProfileField label="Blood Group" value={null} />)
    expect(html).toContain('—')
  })

  it('renders the value verbatim when present', () => {
    const html = renderToStaticMarkup(<ProfileField label="Roll" value={1} />)
    expect(html).toContain('>1<')
    expect(html).not.toContain('—')
  })
})

describe('ProfileHeader optional slots', () => {
  it('renders name, status and meta but skips the actions row when omitted', () => {
    const html = renderToStaticMarkup(
      <ProfileHeader name="Hasibul Islam" status={<span>Active</span>} meta="Class: Eight | Roll: 1" />,
    )
    expect(html).toContain('Hasibul Islam')
    expect(html).toContain('Active')
    expect(html).toContain('Class: Eight | Roll: 1')
  })

  it('renders the actions row when provided', () => {
    const html = renderToStaticMarkup(
      <ProfileHeader name="Hasibul Islam" status={<span>Active</span>} actions={<button>Archive</button>} />,
    )
    expect(html).toContain('<button')
    expect(html).toContain('Archive')
  })
})

describe('ProfileAside optional slots', () => {
  it('renders only the slots that are passed in', () => {
    const withPhotoOnly = renderToStaticMarkup(<ProfileAside photo={<span data-testid="photo" />} />)
    expect(withPhotoOnly).toContain('data-testid="photo"')
    expect(withPhotoOnly).not.toContain('<dl')

    const withFactsOnly = renderToStaticMarkup(<ProfileAside facts={<span>Roll 1</span>} />)
    expect(withFactsOnly).not.toContain('data-testid="photo"')
    expect(withFactsOnly).toContain('<dl')
    expect(withFactsOnly).toContain('Roll 1')
  })

  it('renders the shaded highlight box only when passed', () => {
    const html = renderToStaticMarkup(<ProfileAside highlight={<span>S0022</span>} />)
    expect(html).toContain('bg-paper-muted')
    expect(html).toContain('S0022')
  })
})
