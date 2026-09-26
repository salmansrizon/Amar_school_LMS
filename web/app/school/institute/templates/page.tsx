import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { InstituteTabs } from '../tabs'

// Blank printable templates (issue #39, PRD §5.11) per
// ui/school-owner/blank-templates.html: paper-based fallback for
// admission/lesson/homework collection when internet/devices aren't
// available. ADR 0007 (issue #25): browser-native print, no server PDF
// renderer or downloadable file — each row opens its own print-preview
// page (same seam as the admission/ID-card printables), where the
// School's own Print button hands off to the browser's Print/Save-as-PDF.

const TEMPLATES: { href: string; nameKey: MessageKey }[] = [
  { href: '/school/institute/templates/admission', nameKey: 'institute.templateAdmission' },
  { href: '/school/institute/templates/homework', nameKey: 'institute.templateHomework' },
  { href: '/school/institute/templates/lesson-plan', nameKey: 'institute.templateLessonPlan' },
  { href: '/school/institute/templates/exam-answer', nameKey: 'institute.templateExamAnswer' },
  { href: '/school/institute/templates/attendance', nameKey: 'institute.templateAttendance' },
]

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function TemplatesPage() {
  const lang: Lang = await currentLang()
  await getSchoolContext() // auth + role gate (redirects if not a School member)

  return (
    <div>
      <PageHeader
        title={t('institute.tabTemplates', lang)}
        crumbs={schoolCrumbs('/school/institute/templates', lang, { label: t('institute.tabTemplates', lang) })}
      />

      <InstituteTabs active="/school/institute/templates" lang={lang} />

      <p className="mb-4 text-sm text-muted">{t('institute.templatesIntro', lang)}</p>

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-strong">
              <th className={thClass}>{t('institute.templateName', lang)}</th>
              <th className={thClass}>{t('institute.templateType', lang)}</th>
              <th className={thClass}>{t('institute.actions', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map((tpl) => (
              <tr key={tpl.href} className="border-b border-line">
                <td className={`${tdClass} font-medium`}>{t(tpl.nameKey, lang)}</td>
                <td className={tdClass}>
                  <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                    PDF
                  </span>
                </td>
                <td className={tdClass}>
                  <Link
                    href={tpl.href}
                    className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                  >
                    ⬇ {t('institute.open', lang)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
