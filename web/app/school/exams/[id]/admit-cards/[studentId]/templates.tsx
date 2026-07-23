import { PrintPage, InstituteHeader, InfoGrid, PhotoBox, SignatureRow, QrFooterRow, QrMark } from '@/components/print/pieces'
import { t, type Lang } from '@/lib/i18n'
import type { InstitutePrintHeader } from '@/lib/institute-print'
import type { PrintTheme } from '@/lib/print-themes'

// Exams V (issue #48, PRD §5.5): the 2 admit-card template variants. No
// grades/rank here (an admit card carries identity + seat only) — both
// templates get the exact same computed props, differing only in layout.
// Template 1 reproduces admit-card-preview.html exactly (the "strict
// reference": no QR mark, a plain powered-by footer); Template 2 is an
// original variant that adds the QR authenticity mark other printables carry
// (issue #33), inside a bordered card.

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

/** Template 1 — Classic: admit-card-preview.html's exact structure, no QR. */
function ClassicTemplate(props: AdmitCardTemplateProps) {
  const { lang } = props
  return (
    <PrintPage theme={props.theme}>
      <InstituteHeader
        institute={props.institute}
        accent={props.theme.accent}
        docTitle={`${t('admitCard.docWord', lang)} — ${props.examLabel}`}
      />
      <div className="mb-5 flex gap-5">
        <div className="flex-1">
          <InfoGrid rows={infoRows(props)} />
        </div>
        <PhotoBox src={props.photoSrc} label={t('admitCard.photo', lang)} />
      </div>
      <SignatureRow labels={[t('markSheet.headTeacher', lang), t('admitCard.classTeacher', lang)]} />
      <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">{t('print.poweredBy', lang)}</div>
    </PrintPage>
  )
}

/** Template 2 — Bordered: the info/photo block sits in a bordered card, and
 * carries a QR authenticity mark (issue #33's QrFooterRow), matching how
 * mark-sheet's Template 2 differentiates from Template 1. */
function BorderedTemplate(props: AdmitCardTemplateProps) {
  const { lang } = props
  return (
    <PrintPage theme={props.theme}>
      <InstituteHeader
        institute={props.institute}
        accent={props.theme.accent}
        docTitle={`${t('admitCard.docWord', lang)} — ${props.examLabel}`}
      />
      <div
        style={{ borderColor: props.theme.accent }}
        className="mb-5 flex gap-5 rounded-md border-2 border-line-strong p-3"
      >
        <div className="flex-1">
          <InfoGrid rows={infoRows(props)} />
        </div>
        <PhotoBox src={props.photoSrc} label={t('admitCard.photo', lang)} />
      </div>
      <SignatureRow labels={[t('markSheet.headTeacher', lang), t('admitCard.classTeacher', lang)]} />
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

export function AdmitCardTemplate(props: AdmitCardTemplateProps) {
  if (props.template === 2) return <BorderedTemplate {...props} />
  return <ClassicTemplate {...props} />
}
