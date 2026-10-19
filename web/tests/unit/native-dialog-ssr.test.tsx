import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NativeDialog } from '@/components/native-dialog'

// A dialog that is open on first render (the student question popup opened by
// URL) is rendered on the server, where there is no `document`.
describe('NativeDialog on the server', () => {
  it('renders an initially open dialog without touching document', () => {
    const out = renderToStaticMarkup(
      <NativeDialog open onRequestClose={() => {}} labelledBy="t" className="">
        <h2 id="t">Title</h2>
      </NativeDialog>,
    )
    expect(out).toContain('Title')
  })
})
