import { Text, View, StyleSheet } from '@react-pdf/renderer'
import { pdfTokens, pdfSpace } from '../theme'
import type { ExamInfo, GradeSummary, InstituteInfo, StudentInfo } from '../types'

/**
 * Composable template pieces shared by every printable, mirroring the legacy
 * `C_TAMPLATES` shared-header/footer pattern (issue #25). A new printable is
 * assembled from these, not built from scratch: institute header, exam header,
 * student-info block, grade panel, and the "powered by" footer.
 */

const s = StyleSheet.create({
  instituteHeader: {
    textAlign: 'center',
    marginBottom: pdfSpace.md,
    paddingBottom: pdfSpace.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: pdfTokens.ink,
    borderBottomStyle: 'solid',
  },
  instituteName: { fontSize: 18, fontWeight: 700, color: pdfTokens.ink },
  instituteAddress: { fontSize: 9, color: pdfTokens.muted, marginTop: 2 },
  instituteReg: { fontSize: 8, color: pdfTokens.muted, marginTop: 1 },

  examHeader: { alignItems: 'center', marginBottom: pdfSpace.md },
  examTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: pdfTokens.paper,
    backgroundColor: pdfTokens.brandInk,
    paddingVertical: 3,
    paddingHorizontal: pdfSpace.md,
    borderRadius: 4,
  },
  examMeta: { fontSize: 9, color: pdfTokens.inkSoft, marginTop: 4 },

  infoBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: pdfTokens.lineStrong,
    borderStyle: 'solid',
    borderRadius: 4,
    padding: pdfSpace.sm,
    marginBottom: pdfSpace.md,
  },
  infoCell: { width: '50%', flexDirection: 'row', paddingVertical: 2 },
  infoLabel: { fontSize: 9, color: pdfTokens.muted, width: 70 },
  infoValue: { fontSize: 9, fontWeight: 600, color: pdfTokens.ink, flex: 1 },

  gradePanel: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: pdfTokens.lineStrong,
    borderStyle: 'solid',
    borderRadius: 4,
    marginTop: pdfSpace.md,
  },
  gradeCell: {
    flex: 1,
    padding: pdfSpace.sm,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: pdfTokens.line,
    borderRightStyle: 'solid',
  },
  gradeCellLast: { borderRightWidth: 0 },
  gradeLabel: { fontSize: 7.5, color: pdfTokens.muted, textTransform: 'uppercase' },
  gradeValue: { fontSize: 13, fontWeight: 700, color: pdfTokens.ink, marginTop: 2 },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: pdfTokens.line,
    borderTopStyle: 'solid',
    paddingTop: 4,
  },
  footerText: { fontSize: 7, color: pdfTokens.muted },
  poweredBy: { fontSize: 7, color: pdfTokens.brandInk, fontWeight: 600 },
})

export function InstituteHeader({ institute }: { institute: InstituteInfo }) {
  return (
    <View style={s.instituteHeader}>
      <Text style={s.instituteName}>{institute.name}</Text>
      <Text style={s.instituteAddress}>{institute.address}</Text>
      {institute.registration ? <Text style={s.instituteReg}>{institute.registration}</Text> : null}
    </View>
  )
}

export function ExamHeader({ exam }: { exam: ExamInfo }) {
  const meta = [
    `${exam.className}${exam.section ? ` (${exam.section})` : ''}`,
    String(exam.year),
  ].join(' · ')
  return (
    <View style={s.examHeader}>
      <Text style={s.examTitle}>{exam.title}</Text>
      <Text style={s.examMeta}>{meta}</Text>
    </View>
  )
}

function InfoCell({ label, value }: { label: string; value?: string }) {
  return (
    <View style={s.infoCell}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value ?? '—'}</Text>
    </View>
  )
}

export function StudentInfoBlock({
  student,
  labels,
}: {
  student: StudentInfo
  labels: { name: string; roll: string; className: string; guardian: string }
}) {
  return (
    <View style={s.infoBlock}>
      <InfoCell label={labels.name} value={student.name} />
      <InfoCell label={labels.roll} value={student.roll} />
      <InfoCell
        label={labels.className}
        value={`${student.className}${student.section ? ` (${student.section})` : ''}`}
      />
      <InfoCell label={labels.guardian} value={student.guardianName} />
    </View>
  )
}

export function GradePanel({
  summary,
  labels,
}: {
  summary: GradeSummary
  labels: { obtained: string; gpa: string; grade: string; result: string; pass: string; fail: string }
}) {
  const cells = [
    { key: 'obtained', label: labels.obtained, value: `${summary.obtainedMarks}/${summary.totalMarks}` },
    { key: 'gpa', label: labels.gpa, value: summary.gpa != null ? summary.gpa.toFixed(2) : '—' },
    { key: 'grade', label: labels.grade, value: summary.finalGrade },
    { key: 'result', label: labels.result, value: summary.passed ? labels.pass : labels.fail },
  ]
  return (
    <View style={s.gradePanel}>
      {cells.map((c, i) => (
        <View key={c.key} style={i === cells.length - 1 ? [s.gradeCell, s.gradeCellLast] : s.gradeCell}>
          <Text style={s.gradeLabel}>{c.label}</Text>
          <Text
            style={
              c.key === 'result'
                ? [s.gradeValue, { color: summary.passed ? pdfTokens.mintDeep : pdfTokens.alertDeep }]
                : s.gradeValue
            }
          >
            {c.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function PoweredByFooter({ note }: { note?: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{note ?? ''}</Text>
      <Text style={s.poweredBy}>Powered by Amar School Management</Text>
    </View>
  )
}
