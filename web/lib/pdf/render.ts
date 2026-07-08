import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { registerFonts } from './register-fonts'

/** Any element whose subtree roots at a react-pdf `<Document>` — components that
 *  return a Document (e.g. `MarkSheetDocument`) as well as a bare `<Document>`. */
type DocElement = ReactElement

/**
 * Single choke point for turning a react-pdf document element into bytes.
 * Every print route/module calls this so font registration and the render
 * mechanism live in exactly one place (the PDF seam, issue #25).
 *
 * Must run on the Node serverless runtime, never Edge — react-pdf depends on
 * Node stream/fs internals (see ADR 0007).
 */
export async function renderPdf(doc: DocElement): Promise<Uint8Array> {
  registerFonts()
  // renderToBuffer's type wants a bare Document element; our root is a component
  // that returns one, which the reconciler resolves identically at runtime.
  const buffer = await renderToBuffer(doc as ReactElement<DocumentProps>)
  return new Uint8Array(buffer)
}
