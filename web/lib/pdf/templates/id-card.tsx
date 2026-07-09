import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { pdfTokens } from '../theme'
import { DOC_FONT } from '../register-fonts'

export interface IdCardData {
  instituteName: string
  studentName: string
  className: string
  roll: string
  guardianMobile: string
  bloodGroup: string
  photoDataUri?: string
  labels: { roll: string; className: string; guardian: string; blood: string }
}

const s = StyleSheet.create({
  page: {
    fontFamily: DOC_FONT,
    color: pdfTokens.ink,
    padding: 24,
    backgroundColor: pdfTokens.paper,
  },
  card: {
    width: 300,
    borderWidth: 1.5,
    borderColor: pdfTokens.brandInk,
    borderStyle: 'solid',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: pdfTokens.brandInk,
    color: pdfTokens.paper,
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  body: { flexDirection: 'row', padding: 10, gap: 10 },
  photo: {
    width: 70,
    height: 84,
    borderRadius: 4,
    objectFit: 'cover',
    border: `1 solid ${pdfTokens.line}`,
  },
  photoPlaceholder: {
    width: 70,
    height: 84,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: pdfTokens.line,
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
    color: pdfTokens.muted,
    fontSize: 26,
  },
  info: { flex: 1, justifyContent: 'center' },
  name: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  row: { flexDirection: 'row', fontSize: 8, marginBottom: 2 },
  key: { width: 54, color: pdfTokens.muted },
  val: { flex: 1, fontWeight: 600 },
  footer: {
    fontSize: 6.5,
    color: pdfTokens.muted,
    textAlign: 'center',
    paddingBottom: 6,
  },
})

export function IdCardDocument({ data }: { data: IdCardData }) {
  const { labels } = data
  return (
    <Document title={`ID Card — ${data.studentName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.card}>
          <Text style={s.header}>{data.instituteName}</Text>
          <View style={s.body}>
            {data.photoDataUri ? (
              // react-pdf's Image is not the DOM <img>; alt-text does not apply.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.photoDataUri} style={s.photo} />
            ) : (
              // Emoji-free placeholder (Hind Siliguri has no emoji glyphs): initial.
              <View style={s.photoPlaceholder}>
                <Text>{data.studentName.trim().charAt(0) || '—'}</Text>
              </View>
            )}
            <View style={s.info}>
              <Text style={s.name}>{data.studentName}</Text>
              <View style={s.row}>
                <Text style={s.key}>{labels.className}</Text>
                <Text style={s.val}>{data.className || '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.key}>{labels.roll}</Text>
                <Text style={s.val}>{data.roll || '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.key}>{labels.guardian}</Text>
                <Text style={s.val}>{data.guardianMobile || '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.key}>{labels.blood}</Text>
                <Text style={s.val}>{data.bloodGroup || '—'}</Text>
              </View>
            </View>
          </View>
          <Text style={s.footer}>Powered by Amar School Management</Text>
        </View>
      </Page>
    </Document>
  )
}
