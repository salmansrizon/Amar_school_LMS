import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Lang } from '@/lib/i18n'
import { pdfTokens, pdfSpace } from '../theme'
import { DOC_FONT } from '../register-fonts'
import type { InstituteInfo } from '../types'
import { InstituteHeader, PoweredByFooter } from './pieces'

/**
 * Class routine printable (issue #45), built on the shared #25 seam. Reuses the
 * InstituteHeader + PoweredByFooter pieces and lays out the weekly grid.
 */

export interface RoutineCellText {
  subject?: string
  teacher?: string
  room?: string
}

export interface RoutineData {
  institute: InstituteInfo
  title: string
  className: string
  section?: string
  published: boolean
  days: { index: number; label: string }[]
  periods: number[]
  cells: Record<string, RoutineCellText>
}

const L = {
  period: { bn: 'পিরিয়ড', en: 'Period' },
  published: { bn: 'প্রকাশিত', en: 'Published' },
  draft: { bn: 'খসড়া', en: 'Draft' },
} as const

const s = StyleSheet.create({
  page: {
    fontFamily: DOC_FONT,
    fontSize: 8,
    color: pdfTokens.ink,
    paddingTop: 32,
    paddingHorizontal: 28,
    paddingBottom: 48,
    backgroundColor: pdfTokens.paper,
  },
  subhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: pdfSpace.sm,
  },
  className: { fontSize: 11, fontWeight: 700 },
  badge: { fontSize: 8, fontWeight: 600, color: pdfTokens.brandInk },
  table: { borderWidth: 1, borderColor: pdfTokens.lineStrong, borderStyle: 'solid' },
  row: { flexDirection: 'row' },
  headCell: {
    flex: 1,
    padding: 4,
    backgroundColor: pdfTokens.paperMuted,
    fontWeight: 700,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: pdfTokens.line,
    borderRightStyle: 'solid',
    borderBottomWidth: 1,
    borderBottomColor: pdfTokens.lineStrong,
    borderBottomStyle: 'solid',
  },
  periodCol: { width: 42 },
  cell: {
    flex: 1,
    minHeight: 34,
    padding: 3,
    borderRightWidth: 1,
    borderRightColor: pdfTokens.line,
    borderRightStyle: 'solid',
    borderBottomWidth: 1,
    borderBottomColor: pdfTokens.line,
    borderBottomStyle: 'solid',
  },
  subject: { fontWeight: 700 },
  meta: { color: pdfTokens.muted, marginTop: 1 },
})

export function RoutineDocument({ data, lang = 'bn' }: { data: RoutineData; lang?: Lang }) {
  const { institute, title, className, section, published, days, periods, cells } = data
  const cols = days.length

  return (
    <Document title={`Routine — ${className}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <InstituteHeader institute={institute} />
        <View style={s.subhead}>
          <Text style={s.className}>
            {title}: {className}
            {section ? ` (${section})` : ''}
          </Text>
          <Text style={s.badge}>{published ? L.published[lang] : L.draft[lang]}</Text>
        </View>

        <View style={s.table}>
          {/* header row */}
          <View style={s.row}>
            <Text style={[s.headCell, s.periodCol]}>{L.period[lang]}</Text>
            {days.map((d, i) => (
              <Text key={d.index} style={i === cols - 1 ? [s.headCell, { borderRightWidth: 0 }] : s.headCell}>
                {d.label}
              </Text>
            ))}
          </View>
          {/* period rows */}
          {periods.map((p) => (
            <View key={p} style={s.row} wrap={false}>
              <Text style={[s.cell, s.periodCol, { textAlign: 'center', fontWeight: 700, backgroundColor: pdfTokens.paperMuted }]}>
                {p}
              </Text>
              {days.map((d, i) => {
                const c = cells[`${d.index}:${p}`]
                return (
                  <View key={d.index} style={i === cols - 1 ? [s.cell, { borderRightWidth: 0 }] : s.cell}>
                    {c ? (
                      <>
                        {c.subject ? <Text style={s.subject}>{c.subject}</Text> : null}
                        {c.teacher ? <Text style={s.meta}>{c.teacher}</Text> : null}
                        {/* No room emoji here — Hind Siliguri has no emoji glyphs (would tofu). */}
                        {c.room ? <Text style={s.meta}>{c.room}</Text> : null}
                      </>
                    ) : null}
                  </View>
                )
              })}
            </View>
          ))}
        </View>

        <PoweredByFooter />
      </Page>
    </Document>
  )
}
