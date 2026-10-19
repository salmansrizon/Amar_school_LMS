import type { ComponentProps } from 'react'
import { PrintFrame } from '@/components/print/pieces'
import { printVerifyQr, type PrintQrTarget } from '@/lib/print-verify-server'

/** An A4 document: PrintFrame with its verification QR built from `verify`.
 *  Templates that already hold the SVG (batch prints) use PrintFrame itself. */
export async function PrintDocument({
  verify,
  ...frame
}: Omit<ComponentProps<typeof PrintFrame>, 'qrSvg'> & { verify: PrintQrTarget }) {
  return <PrintFrame {...frame} qrSvg={await printVerifyQr(verify)} />
}
