import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Lang } from '@/lib/i18n'
import { pdfTokens, pdfSpace } from '../theme'
import { DOC_FONT } from '../register-fonts'
import type { MarkSheetData } from '../types'
import { ExamHeader, GradePanel, InstituteHeader, PoweredByFooter, StudentInfoBlock } from './pieces'

/**
 * The first real printable built on the shared seam (issue #25) — a single
 * student mark sheet. It exercises every composable piece, proving the template
 * layer before the rest of §5.5's printables (progress reports, admit cards)
 * build on it. Bilingual labels (ADR 0004) render in the requested language.
 */

const L: Record<string, { bn: string; en: string }> = {
  subject: { bn: 'বিষয়', en: 'Subject' },
  fullMarks: { bn: 'পূর্ণমান', en: 'Full Marks' },
  obtained: { bn: 'প্রাপ্ত নম্বর', en: 'Obtained' },
  grade: { bn: 'গ্রেড', en: 'Grade' },
  gpa: { bn: 'জিপিএ', en: 'GPA' },
  result: { bn: 'ফলাফল', en: 'Result' },
  pass: { bn: 'উত্তীর্ণ', en: 'PASS' },
  fail: { bn: 'অনুত্তীর্ণ', en: 'FAIL' },
  name: { bn: 'নাম', en: 'Name' },
  roll: { bn: 'রোল', en: 'Roll' },
  className: { bn: 'শ্রেণি', en: 'Class' },
  guardian: { bn: 'অভিভাবক', en: 'Guardian' },
  position: { bn: 'মেধাস্থান', en: 'Position' },
}

const s = StyleSheet.create({
  page: {
    fontFamily: DOC_FONT,
    fontSize: 9,
    color: pdfTokens.ink,
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 48,
    backgroundColor: pdfTokens.paper,
  },
  table: {
    borderWidth: 1,
    borderColor: pdfTokens.lineStrong,
    borderStyle: 'solid',
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: pdfTokens.line,
    borderBottomStyle: 'solid',
  },
  headRow: { backgroundColor: pdfTokens.paperMuted },
  rowLast: { borderBottomWidth: 0 },
  cell: { paddingVertical: 4, paddingHorizontal: pdfSpace.sm },
  cSubject: { flex: 1 },
  cNum: { width: 70, textAlign: 'center' },
  cGrade: { width: 55, textAlign: 'center' },
  headText: { fontSize: 8.5, fontWeight: 600, color: pdfTokens.inkSoft },
  positionLine: {
    marginTop: pdfSpace.sm,
    fontSize: 9,
    color: pdfTokens.inkSoft,
    textAlign: 'right',
  },
})

export function MarkSheetDocument({ data, lang = 'bn' }: { data: MarkSheetData; lang?: Lang }) {
  const tr = (k: keyof typeof L) => L[k][lang]
  const { institute, exam, student, subjects, summary } = data

  return (
    <Document title={`Mark Sheet — ${student.name}`}>
      <Page size="A4" style={s.page}>
        <InstituteHeader institute={institute} />
        <ExamHeader exam={exam} />
        <StudentInfoBlock
          student={student}
          labels={{
            name: tr('name'),
            roll: tr('roll'),
            className: tr('className'),
            guardian: tr('guardian'),
          }}
        />

        <View style={s.table}>
          <View style={[s.row, s.headRow]}>
            <Text style={[s.cell, s.cSubject, s.headText]}>{tr('subject')}</Text>
            <Text style={[s.cell, s.cNum, s.headText]}>{tr('fullMarks')}</Text>
            <Text style={[s.cell, s.cNum, s.headText]}>{tr('obtained')}</Text>
            <Text style={[s.cell, s.cGrade, s.headText]}>{tr('grade')}</Text>
          </View>
          {subjects.map((sub, i) => (
            <View key={sub.subject} style={i === subjects.length - 1 ? [s.row, s.rowLast] : s.row}>
              <Text style={[s.cell, s.cSubject]}>{sub.subject}</Text>
              <Text style={[s.cell, s.cNum]}>{sub.fullMarks}</Text>
              <Text style={[s.cell, s.cNum]}>{sub.obtainedMarks}</Text>
              <Text style={[s.cell, s.cGrade]}>{sub.grade}</Text>
            </View>
          ))}
        </View>

        <GradePanel
          summary={summary}
          labels={{
            obtained: tr('obtained'),
            gpa: tr('gpa'),
            grade: tr('grade'),
            result: tr('result'),
            pass: tr('pass'),
            fail: tr('fail'),
          }}
        />

        {summary.position != null ? (
          <Text style={s.positionLine}>
            {tr('position')}: {summary.position}
          </Text>
        ) : null}

        <PoweredByFooter />
      </Page>
    </Document>
  )
}
