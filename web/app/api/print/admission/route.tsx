import type { NextRequest } from 'next/server'
import type { Lang } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { AdmissionFormDocument, type PrintField, type AdmissionFormData } from '@/lib/pdf/templates/admission-form'
import { renderPdf } from '@/lib/pdf/render'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const studentId = url.searchParams.get('student')
  if (!studentId) return new Response('student is required', { status: 400 })
  const override = url.searchParams.get('lang')
  const lang: Lang = override === 'en' ? 'en' : override === 'bn' ? 'bn' : await currentLang()

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return new Response('forbidden', { status: 403 })

  const { data: student } = await supabase.from('students').select('*').eq('id', studentId).maybeSingle()
  if (!student) return new Response('not found', { status: 404 })

  const { data: school } = await supabase.from('schools').select('name').eq('id', student.school_id).maybeSingle()

  const v = (k: string) => {
    const x = student[k]
    return x == null ? '' : String(x)
  }
  const yn = (k: string) => (student[k] ? '✓' : '—')
  const fields: PrintField[] = [
    { label: t('students.roll', lang), value: v('roll_number') },
    { label: t('students.class', lang), value: v('class_name') },
    { label: t('students.section', lang), value: v('section') },
    { label: t('students.gender', lang), value: v('gender') },
    { label: t('students.dob', lang), value: v('date_of_birth') },
    { label: t('students.blood', lang), value: v('blood_group') },
    { label: t('students.religion', lang), value: v('religion') },
    { label: t('students.mobile', lang), value: v('student_mobile') },
    { label: t('students.village', lang), value: v('village') },
    { label: t('students.union', lang), value: v('union_name') },
    { label: t('students.upazila', lang), value: v('upazila') },
    { label: t('students.district', lang), value: v('district') },
    { label: t('students.guardianName', lang), value: v('guardian_name') },
    { label: t('students.guardianRelation', lang), value: v('guardian_relation') },
    { label: t('students.guardianMobile', lang), value: v('guardian_mobile') },
    { label: t('students.guardianNid', lang), value: v('guardian_nid') },
    { label: t('students.prevInstitute', lang), value: v('previous_institute') },
    { label: t('students.prevClass', lang), value: v('previous_class') },
    { label: t('students.siblings', lang), value: v('sibling_info') },
    { label: t('students.freedomFighter', lang), value: yn('is_freedom_fighter_child') },
    { label: t('students.indigenous', lang), value: yn('is_indigenous') },
  ]

  const data: AdmissionFormData = {
    institute: { name: school?.name ?? '—', address: '' },
    title: t('students.admissionForm', lang),
    studentName: student.full_name,
    fields: [{ label: t('students.name', lang), value: student.full_name }, ...fields],
  }

  const pdf = await renderPdf(<AdmissionFormDocument data={data} />)
  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="admission-${student.full_name}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
