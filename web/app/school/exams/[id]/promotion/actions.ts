'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { archiveStudent } from '@/app/school/students/actions'

// Promotion reuses issue #27's transfer_student RPC per student (its history
// row + student update already commit atomically per call) rather than a new
// bulk RPC — a "Promote Selected" click is simply one transfer_student call
// per checked student, the same shape as issue #46's "bulk assign all"
// (an app-layer loop, not one giant transaction across students). "Make Old"
// reuses the existing archiveStudent action (issue #27's Old Students
// soft-archive) rather than a new archive path.

function pagePath(examId: string): string {
  return `/school/exams/${examId}/promotion`
}

export interface PromotionItem {
  studentId: string
  newRoll: number | null
}

export interface BulkResult {
  error?: string
  failedCount?: number
}

export async function promoteStudents(
  examId: string,
  toClass: string,
  toSection: string | null,
  items: PromotionItem[],
): Promise<BulkResult> {
  if (!toClass) return { error: 'A destination class is required' }
  if (!items.length) return {}

  const supabase = await createClient()
  let failedCount = 0
  let lastError: string | null = null
  for (const item of items) {
    const { error } = await supabase.rpc('transfer_student', {
      p_student_id: item.studentId,
      p_to_class: toClass,
      p_to_section: toSection,
      p_to_shift_id: null,
      p_note: 'Promotion',
      p_new_roll: item.newRoll,
    })
    if (error) {
      failedCount += 1
      lastError = error.message
    }
  }
  revalidatePath(pagePath(examId))
  revalidatePath('/school/students')
  if (failedCount) return { error: lastError ?? 'Some students could not be promoted', failedCount }
  return {}
}

export async function makeOldStudents(examId: string, studentIds: string[]): Promise<BulkResult> {
  if (!studentIds.length) return {}
  let failedCount = 0
  let lastError: string | null = null
  for (const id of studentIds) {
    const result = await archiveStudent(id)
    if (result.error) {
      failedCount += 1
      lastError = result.error
    }
  }
  revalidatePath(pagePath(examId))
  if (failedCount) return { error: lastError ?? 'Some students could not be archived', failedCount }
  return {}
}
