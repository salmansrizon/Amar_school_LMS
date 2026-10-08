import { QrFooterRow } from '@/components/print/pieces'
import { t, type Lang } from '@/lib/i18n'
import { printVerifyQr, type PrintQrTarget } from '@/lib/print-verify-server'

/** The footer every print ends with: the verification QR for this document
 *  (or the labelled box while it has none) beside the powered-by line. */
export async function PrintVerifyFooter({ lang, ...target }: PrintQrTarget & { lang: Lang }) {
  return (
    <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qrSvg={await printVerifyQr(target)} />
  )
}
