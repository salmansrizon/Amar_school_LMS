import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import type { Importance, PublicationKind, TargetScope } from '@/lib/publishing'
import { CreateNoticeForm } from '../../new/create-form'
import { getNotice } from '../notice-detail'
import { pageTitle } from '@/lib/page-title'

// Edit a published notice/homework/lesson row: the create form, prefilled, and
// saved through updatePublication (same validation as create). The table has no
// status column, so there is no unpublish here — only edit and delete.
export const generateMetadata = pageTitle('notices.editTitle')

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const notice = await getNotice(id)
  if (!notice) notFound()
  const { row } = notice
  const { supabase, schoolId } = await getSchoolContext()

  const [{ data: allOfferings }, { data: school }] = await Promise.all([
    supabase
      .from('class_offerings')
      .select('id, name, section, group_department, shift, academic_year')
      .order('name'),
    supabase.from('schools').select('active_academic_year').eq('id', schoolId).maybeSingle(),
  ])
  const activeAcademicYear = (school?.active_academic_year ?? null) as number | null
  // Same picker rule as the create page (active-year Offerings only), plus the
  // row's own Offering: a notice aimed at an earlier year's class must reopen
  // with its target still selected, not blank.
  const offerings = (allOfferings ?? []).filter(
    (o) => activeAcademicYear === null || o.academic_year === activeAcademicYear || o.id === row.class_offering_id,
  )

  return (
    <>
      <PageHeader
        title={t('notices.editTitle', lang)}
        backHref={`/school/notices/${id}`}
        backLabel={row.title}
        crumbs={schoolCrumbs('/school/notices', lang, [
          { label: t('notices.title', lang), href: '/school/notices' },
          { label: row.title, href: `/school/notices/${id}` },
          { label: t('notices.editTitle', lang) },
        ])}
      />
      <CreateNoticeForm
        lang={lang}
        offerings={offerings}
        // An edited broadcast keeps the Year it was published for.
        activeAcademicYear={row.target_scope === 'broadcast' ? (row.target_academic_year ?? activeAcademicYear) : activeAcademicYear}
        initial={{
          id: row.id,
          kind: row.kind as PublicationKind,
          importance: row.importance as Importance,
          title: row.title,
          content: row.content ?? '',
          targetScope: row.target_scope as TargetScope,
          offeringId: row.class_offering_id ?? '',
          targetClassName: row.target_class_name ?? '',
          targetShift: row.target_shift ?? '',
          targetGroupDepartment: row.target_group_department ?? '',
          targetSection: row.target_section ?? '',
          linkUrl: row.link_url ?? '',
          hasImage: Boolean(row.image_path),
        }}
      />
    </>
  )
}
