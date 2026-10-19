import { PrintFrame, InfoGrid, PhotoBox, SignatureRow } from '@/components/print/pieces'
import { t, type Lang } from '@/lib/i18n'
import type { InstitutePrintHeader } from '@/lib/institute-print'
import type { PrintTheme } from '@/lib/print-themes'

// Exams V (issue #48, PRD §5.5): the 2 admit-card template variants. No
// grades/rank here (an admit card carries identity + seat only) — both
// templates get the exact same computed props, differing only in layout:
// Template 2 sets the info/photo block in a bordered card.
//
// Every admit card route prints one card to a page (the single card, the
// student portal's own, and each card of a print-all batch), so the card is a
// page document: PrintFrame's header and footer bands at the page edges, the
// school-logo watermark behind, the card's fields in the content area (owner's
// decision 2026-10-09). The QR and the powered-by line live in the footer band.

export interface AdmitCardTemplateProps {
  lang: Lang
  /** Full institution header block (issue #92) — built by the shared loader. */
  institute: InstitutePrintHeader
  examLabel: string
  studentName: string
  roll: string
  classSection: string
  guardianName: string
  examCenter: string
  photoSrc: string | null
  qrSvg: string
  template: 1 | 2
  /** Curated colour preset (issue #94): the school's saved default, or a
   *  per-print override from the URL. */
  theme: PrintTheme
}

function infoRows(props: AdmitCardTemplateProps) {
  return [
    { label: t('admitCard.studentName', props.lang), value: props.studentName },
    { label: t('admitCard.roll', props.lang), value: props.roll },
    { label: t('admitCard.classSection', props.lang), value: props.classSection },
    { label: t('admitCard.fatherName', props.lang), value: props.guardianName },
    { label: t('admitCard.examCenter', props.lang), value: props.examCenter },
  ]
}

export function AdmitCardTemplate(props: AdmitCardTemplateProps) {
  const { lang, theme } = props
  const bordered = props.template === 2
  return (
    <PrintFrame
      lang={lang}
      institute={props.institute}
      docTitle={`${t('admitCard.docWord', lang)} — ${props.examLabel}`}
      qrSvg={props.qrSvg}
      theme={theme}
      fill
    >
      <div
        style={bordered ? { borderColor: theme.accent } : undefined}
        className={`mb-5 flex gap-5${bordered ? ' rounded-md border-2 border-line-strong p-3' : ''}`}
      >
        <div className="flex-1">
          <InfoGrid rows={infoRows(props)} />
        </div>
        <PhotoBox src={props.photoSrc} label={t('admitCard.photo', lang)} />
      </div>
      <SignatureRow labels={[t('markSheet.headTeacher', lang), t('admitCard.classTeacher', lang)]} />
    </PrintFrame>
  )
}
