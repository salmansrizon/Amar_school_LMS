import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { createClient } from '@/lib/supabase/server'
import {
  PrintPage,
  InstituteHeader,
  InfoGrid,
  GradePanelRow,
  SignatureRow,
  QrFooterRow,
} from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

// Prototype printable (issue #25) proving the ADR 0007 print seam end-to-end:
// real school + exam from the DB, sample student/marks until the exams module
// (marks entry, grading) lands and replaces SAMPLE below.
const SAMPLE = {
  student: {
    bn: { name: 'মোঃ ইমরান হোসেন', classSection: 'অষ্টম / A', father: 'মোঃ কামাল হোসেন' },
    en: { name: 'Md. Imran Hossain', classSection: 'Class 8 / A', father: 'Md. Kamal Hossain' },
    roll: '01',
  },
  subjects: [
    { bn: 'বাংলা', en: 'Bangla', full: 100, got: 88, grade: 'A+', gpa: 5 },
    { bn: 'ইংরেজি', en: 'English', full: 100, got: 82, grade: 'A+', gpa: 5 },
    { bn: 'গণিত', en: 'Mathematics', full: 100, got: 95, grade: 'A+', gpa: 5 },
    { bn: 'বিজ্ঞান', en: 'Science', full: 100, got: 91, grade: 'A+', gpa: 5 },
    { bn: 'সামাজিক বিজ্ঞান', en: 'Social Science', full: 100, got: 78, grade: 'A', gpa: 4 },
    { bn: 'তথ্য ও যোগাযোগ প্রযুক্তি', en: 'ICT', full: 50, got: 44, grade: 'A+', gpa: 5 },
    { bn: 'ধর্ম শিক্ষা', en: 'Religious Studies', full: 100, got: 84, grade: 'A+', gpa: 5 },
  ],
}

export default async function MarkSheetPreviewPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  // Surface a missing school row instead of printing a blank letterhead.
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('name')
    .maybeSingle()
  if (schoolError || !school) notFound()
  const { data: exam } = await supabase
    .from('exams')
    .select('name, exam_year')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const examTitle = exam
    ? `${exam.name} ${exam.exam_year}`
    : lang === 'bn'
      ? 'বার্ষিক পরীক্ষা ২০২৫'
      : 'Annual Examination 2025'
  const student = SAMPLE.student[lang]
  const totalFull = SAMPLE.subjects.reduce((sum, s) => sum + s.full, 0)
  const totalGot = SAMPLE.subjects.reduce((sum, s) => sum + s.got, 0)
  const overallGpa = SAMPLE.subjects.reduce((sum, s) => sum + s.gpa, 0) / SAMPLE.subjects.length

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/exams" aria-label={t('exams.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{t('markSheet.sampleNote', lang)}</span>
          <PrintButton label={t('print.print', lang)} />
        </div>
      </div>

      <div className="print:hidden">
        <ExamsTabs active="/school/exams/mark-sheet-preview" lang={lang} />
      </div>

      <PrintPage>
        <InstituteHeader
          name={school?.name ?? ''}
          docTitle={`${t('markSheet.docWord', lang)} — ${examTitle}`}
        />

        <InfoGrid
          rows={[
            { label: t('markSheet.studentName', lang), value: student.name },
            { label: t('markSheet.roll', lang), value: SAMPLE.student.roll },
            { label: t('markSheet.classSection', lang), value: student.classSection },
            { label: t('markSheet.fatherName', lang), value: student.father },
          ]}
        />

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-2 font-semibold">{t('markSheet.subject', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('markSheet.fullMarks', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('markSheet.obtained', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('markSheet.grade', lang)}</th>
              <th className="py-2 font-semibold">{t('markSheet.gpa', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.subjects.map((s) => (
              <tr key={s.en} className="border-b border-line">
                <td className="py-2 pr-2">{s[lang]}</td>
                <td className="py-2 pr-2">{s.full}</td>
                <td className="py-2 pr-2">{s.got}</td>
                <td className="py-2 pr-2">
                  <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
                    {s.grade}
                  </span>
                </td>
                <td className="py-2">{s.gpa.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <GradePanelRow>
          <span>
            {t('markSheet.totalMarks', lang)} {totalGot} / {totalFull}
          </span>
          <span>
            {t('markSheet.overallGpa', lang)} {overallGpa.toFixed(2)}
          </span>
          <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs text-mint-deep">
            {t('markSheet.pass', lang)}
          </span>
        </GradePanelRow>

        <SignatureRow
          labels={[
            t('markSheet.classTeacher', lang),
            t('markSheet.examController', lang),
            t('markSheet.headTeacher', lang),
          ]}
        />

        <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
      </PrintPage>
    </main>
  )
}
