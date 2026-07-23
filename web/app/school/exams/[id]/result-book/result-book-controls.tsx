'use client'

import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { selectClass } from '@/components/ui/field'

// Result Book's exam picker (result-book.html's single "exam - class" select
// — an exam already implies one class via exams.class_id, so this is really
// an exam picker whose label happens to include the class). Switching
// navigates to that exam's own /result-book, matching the "server re-renders
// per selection" convention (promotion/page.tsx's ResultControlsBar).

export interface ExamOption {
  id: string
  label: string
}

export function ExamPicker({ examId, exams, lang }: { examId: string; exams: ExamOption[]; lang: Lang }) {
  const router = useRouter()
  return (
    <select
      value={examId}
      aria-label={t('resultBook.pickExam', lang)}
      onChange={(e) => router.push(`/school/exams/${e.target.value}/result-book`)}
      className={`${selectClass({ size: 'md', fullWidth: true })} min-w-56`}
    >
      {exams.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  )
}
