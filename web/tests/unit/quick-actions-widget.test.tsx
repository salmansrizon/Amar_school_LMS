import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuickActions, type QuickAction } from '@/components/ui/widgets'

// Course-card restyle of the dashboard's shortcut tiles (reference: bold
// gradient, category/meta/footer text, giant ghost icon). Pins the one
// branch worth pinning — tone selection — plus the honesty contract: a
// card only shows category/meta/count when the caller actually passed one.

const icon = <svg data-testid="icon" className="size-4" />

function actions(overrides: Partial<QuickAction>[]): QuickAction[] {
  return overrides.map((o, i) => ({ href: `/x/${i}`, label: `Action ${i}`, icon, ...o }))
}

describe('QuickActions tone selection', () => {
  it('gives the primary action brand, then rotates sun/sky/mint by position', () => {
    const html = renderToStaticMarkup(
      <QuickActions
        title="t"
        actions={actions([{ primary: true }, {}, {}, {}, {}])}
      />,
    )
    const cards = html.match(/from-[a-z0-9-]+ to-[a-z0-9-]+/g)
    expect(cards).toEqual([
      'from-brand-600 to-brand-700', // i=0, primary -> forced brand
      'from-sun to-sun-deep', // i=1
      'from-sky to-sky-deep', // i=2
      'from-mint to-mint-deep', // i=3
      'from-brand-600 to-brand-700', // i=4, cycle repeats
    ])
  })

  it('an explicit tone wins over both primary and the rotation', () => {
    const html = renderToStaticMarkup(
      <QuickActions title="t" actions={actions([{ primary: true, tone: 'sky' }])} />,
    )
    expect(html).toContain('from-sky to-sky-deep')
    expect(html).not.toContain('from-brand')
  })
})

describe('QuickActions honesty: category/meta/count render only when passed', () => {
  it('omits the header row entirely when neither category nor count is set', () => {
    const html = renderToStaticMarkup(<QuickActions title="t" actions={actions([{}])} />)
    expect(html).not.toContain('tracking-wider')
  })

  it('renders category, meta and count when the caller supplies them', () => {
    const html = renderToStaticMarkup(
      <QuickActions title="t" actions={actions([{ category: 'People', meta: '9 staff', count: 3 }])} />,
    )
    expect(html).toContain('People')
    expect(html).toContain('9 staff')
    expect(html).toContain('>3<')
  })

  it('falls back to "Open" when the caller does not translate openLabel', () => {
    const html = renderToStaticMarkup(<QuickActions title="t" actions={actions([{}])} />)
    expect(html).toContain('Open')
  })

  it('renders nothing for an empty action list', () => {
    expect(renderToStaticMarkup(<QuickActions title="t" actions={[]} />)).toBe('')
  })
})

describe('QuickActions ghost icon', () => {
  it('clones the action icon to illustration size instead of re-picking one', () => {
    const html = renderToStaticMarkup(<QuickActions title="t" actions={actions([{}])} />)
    // The small icon (`size-4`, passed in by the caller) never reaches the
    // markup as-is — ghostIcon() overrides className, so only the large,
    // tone-tinted clone (`size-28`) should appear.
    expect(html).toContain('size-28')
    expect(html).not.toContain('size-4')
  })
})
