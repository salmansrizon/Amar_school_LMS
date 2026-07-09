import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { pdfTokens, pdfSpace } from '../theme'
import { DOC_FONT } from '../register-fonts'
import type { InstituteInfo } from '../types'
import { InstituteHeader, PoweredByFooter } from './pieces'

/** A labelled field to print (built by the route, which owns i18n). */
export interface PrintField {
  label: string
  value: string
}

export interface AdmissionFormData {
  institute: InstituteInfo
  title: string
  studentName: string
  fields: PrintField[]
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
  title: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: pdfSpace.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: pdfTokens.lineStrong,
    borderStyle: 'solid',
    borderRadius: 4,
  },
  cell: {
    width: '50%',
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: pdfSpace.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfTokens.line,
    borderBottomStyle: 'solid',
  },
  label: { width: 90, color: pdfTokens.muted },
  value: { flex: 1, fontWeight: 600 },
})

export function AdmissionFormDocument({ data }: { data: AdmissionFormData }) {
  return (
    <Document title={`Admission — ${data.studentName}`}>
      <Page size="A4" style={s.page}>
        <InstituteHeader institute={data.institute} />
        <Text style={s.title}>{data.title}</Text>
        <View style={s.grid}>
          {data.fields.map((f) => (
            <View key={f.label} style={s.cell}>
              <Text style={s.label}>{f.label}</Text>
              <Text style={s.value}>{f.value || '—'}</Text>
            </View>
          ))}
        </View>
        <PoweredByFooter />
      </Page>
    </Document>
  )
}
