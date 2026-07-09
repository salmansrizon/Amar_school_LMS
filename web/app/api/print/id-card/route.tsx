import type { NextRequest } from 'next/server'
import type { Lang } from '@/lib/i18n'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { IdCardDocument, type IdCardData } from '@/lib/pdf/templates/id-card'
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

  const { data: student } = await supabase
    .from('students')
    .select('full_name, class_name, section, roll_number, guardian_mobile, blood_group, photo_path, school_id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return new Response('not found', { status: 404 })

  const { data: school } = await supabase.from('schools').select('name').eq('id', student.school_id).maybeSingle()

  // Best-effort embed of the private photo as a data URI (skipped if unreadable).
  let photoDataUri: string | undefined
  if (student.photo_path) {
    const { data: blob } = await supabase.storage.from('student-photos').download(student.photo_path)
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer())
      photoDataUri = `data:${blob.type || 'image/jpeg'};base64,${buf.toString('base64')}`
    }
  }

  const data: IdCardData = {
    instituteName: school?.name ?? '—',
    studentName: student.full_name,
    className: [student.class_name, student.section].filter(Boolean).join(' · '),
    roll: student.roll_number != null ? String(student.roll_number) : '',
    guardianMobile: student.guardian_mobile ?? '',
    bloodGroup: student.blood_group ?? '',
    photoDataUri,
    labels: {
      roll: t('students.roll', lang),
      className: t('students.class', lang),
      guardian: t('students.guardianMobile', lang),
      blood: t('students.blood', lang),
    },
  }

  const pdf = await renderPdf(<IdCardDocument data={data} />)
  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="id-card-${student.full_name}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
