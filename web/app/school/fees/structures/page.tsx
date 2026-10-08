import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { excludeArchivedOfferings } from '@/lib/school/archived-offerings-filter'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { AccountingTabs } from '../accounting-tabs'
import { FeeStructureForm, CopyFeeStructureForm } from './structure-controls'
import { classCatalogueLabel, type ClassCatalogueRow } from '@/lib/class-catalogue'
import { Card, PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { pageTitle } from '@/lib/page-title'

// Fee Structures (map 013 FC1): new-structure form, then the structures as a
// DataTable (search by Class label, Fee Type filter). Edit and copy — once
// per-row disclosures — open in the record drawer (`?view=<id>`), same forms.

type LabelRow = {
  name: string
  section: string | null
  group_department?: string | null
  shift?: string | null
  academic_year?: number | null
} | null

type Row = {
  id: string
  label: string
  academic_year: number
  fee_type: 'monthly' | 'one_time_yearly'
  amount: number
  fine_per_absent_day: number
  class_id: string
}

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('fees.tabStructures')

export default async function FeeStructuresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', type = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()

  // The Offering picker narrows to the Global Academic Year Selection (map #609,
  // T6/#615) — same as the Shift filter beside it. The `fee_structures` rows
  // list below is NOT year-filtered: a historical structure whose Offering year
  // is currently deselected still renders (its label rides its own embed, not
  // this picker fetch). `fee_structures.academic_year` stays derived from the
  // picked Offering, never a user-editable field, so there is no separate year
  // selector here.
  // Fee Structure setup's Class picker never offers an archived Offering
  // (ADR 0024) — historical `fee_structures` rows below stay unfiltered,
  // resolving their own Offering label regardless.
  const [{ data: classes }, { data: allStructures }] = await Promise.all([
    applyGlobalYearFilterToOfferings(
      applyGlobalShiftFilterToOfferings(
        excludeArchivedOfferings(
          supabase
            .from('class_offerings')
            .select('id, name, section, group_department, shift, academic_year')
            .order('created_at'),
        ),
        shiftSelection,
      ),
      academicYearSelection,
    ),
    supabase
      .from('fee_structures')
      .select(
        'id, academic_year, fee_type, amount, fine_per_absent_day, class_id, class_offerings(name, section, group_department, shift, academic_year)',
      )
      .order('academic_year', { ascending: false }),
  ])

  // Started-year history is the signal (#609/#612), not inference from the
  // Offering set — the same boolean the Classes list threads as `showYear`.
  const showYear = startedAcademicYears.length > 1
  const classOptions: ClassCatalogueRow[] = classes ?? []
  const classLabel = (c: LabelRow) => (c ? classCatalogueLabel(c, showYear) : '—')

  const all: Row[] = (allStructures ?? []).map((s) => ({
    id: s.id,
    label: classLabel(s.class_offerings as unknown as LabelRow),
    academic_year: s.academic_year,
    fee_type: s.fee_type as Row['fee_type'],
    amount: Number(s.amount),
    fine_per_absent_day: Number(s.fine_per_absent_day),
    class_id: s.class_id,
  }))
  // Search per ui/school-owner/fee-structures.html ("শ্রেণি খুঁজুন · Search
  // class") — filters the (typically small) structures list by Class label.
  const needle = q.trim().toLowerCase()
  const visible = all.filter((s) => (!needle || s.label.toLowerCase().includes(needle)) && (!type || s.fee_type === type))
  const pageData = paginate(visible, page, pageSize)
  const viewed = view ? (all.find((s) => s.id === view) ?? null) : null

  const fmt = numberFmt(lang)
  const typeLabel = (ft: Row['fee_type']) => t(ft === 'monthly' ? 'fees.monthly' : 'fees.oneTimeYearly', lang)

  const columns: Column<Row>[] = [
    { key: 'class', header: t('fees.class', lang), card: 'title', cell: (s) => <span className="font-semibold">{s.label}</span> },
    { key: 'year', header: t('fees.academicYear', lang), cell: (s) => s.academic_year },
    {
      key: 'type',
      header: t('fees.feeType', lang),
      card: 'badge',
      cell: (s) => <Pill tone={s.fee_type === 'monthly' ? 'brand' : 'muted'}>{typeLabel(s.fee_type)}</Pill>,
    },
    { key: 'amount', header: t('fees.amount', lang), align: 'right', cell: (s) => `৳${fmt.format(s.amount)}` },
    {
      key: 'fine',
      header: t('fees.finePerDay', lang),
      align: 'right',
      cell: (s) => `৳${fmt.format(s.fine_per_absent_day)}`,
    },
  ]

  return (
    <>
      <PageHeader
        title={t('fees.tabStructures', lang)}
        crumbs={schoolCrumbs('/school/fees', lang, [
          { label: t('fees.title', lang), href: '/school/fees' },
          { label: t('fees.tabStructures', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(all.length)}`}
      />

      <AccountingTabs active="structures" lang={lang} />

      <Card className="mb-section">
        <h2 className="mb-3 font-bold">{t('fees.newStructure', lang)}</h2>
        {!classOptions.length ? (
          <p className="text-sm text-muted">{t('routine.noClasses', lang)}</p>
        ) : (
          <FeeStructureForm classes={classOptions} lang={lang} showYear={showYear} />
        )}
      </Card>

      <DataTable
        rows={pageData.items}
        rowId={(s) => s.id}
        rowLabel={(s) => s.label}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('fees.tabStructures', lang)}
        search={{ placeholder: t('fees.searchClass', lang) }}
        filters={[
          {
            param: 'type',
            label: t('fees.feeType', lang),
            options: (['monthly', 'one_time_yearly'] as const).map((v) => ({ value: v, label: typeLabel(v) })),
          },
        ]}
        rowActions={(s) => <ViewLink id={s.id} params={params} label={t('fees.edit', lang)} name={s.label} />}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <EmptyState
            icon="fees"
            title={t('fees.noStructures', lang)}
            action={{ href: '/school/fees/structures', label: t('students.clearFilters', lang) }}
            lang={lang}
          />
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.label ?? ''}
        subtitle={viewed ? `${viewed.academic_year} · ${typeLabel(viewed.fee_type)}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <div className="space-y-section">
            <section>
              <h3 className="mb-3 font-bold">{t('fees.edit', lang)}</h3>
              <FeeStructureForm
                key={viewed.id}
                classes={classOptions}
                lang={lang}
                showYear={showYear}
                editing={{
                  id: viewed.id,
                  class_id: viewed.class_id,
                  academic_year: viewed.academic_year,
                  fee_type: viewed.fee_type,
                  amount: viewed.amount,
                  fine_per_absent_day: viewed.fine_per_absent_day,
                }}
              />
            </section>
            <section className="border-t border-line pt-section">
              <h3 className="mb-1 font-bold">{t('fees.copy', lang)}</h3>
              <p className="mb-3 text-xs text-muted">{t('fees.copyTitle', lang)}</p>
              <CopyFeeStructureForm key={viewed.id} sourceId={viewed.id} classes={classOptions} lang={lang} showYear={showYear} />
            </section>
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
