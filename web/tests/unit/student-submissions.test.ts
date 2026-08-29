import { describe, it, expect } from 'vitest'
import {
  rejectSubmission,
  submissionExtension,
  submissionPath,
  MAX_SUBMISSION_BYTES,
  MAX_SUBMISSION_FILES,
} from '@/lib/student/submissions'

describe('submissionExtension', () => {
  it('accepts photos of an exercise book and a PDF', () => {
    expect(submissionExtension('image/jpeg')).toBe('jpg')
    expect(submissionExtension('application/pdf')).toBe('pdf')
  })

  it('refuses anything else', () => {
    expect(submissionExtension('application/x-msdownload')).toBeNull()
    expect(submissionExtension('')).toBeNull()
  })
})

describe('rejectSubmission', () => {
  it('accepts a normal photo', () => {
    expect(rejectSubmission({ type: 'image/jpeg', size: 1024 }, 0)).toBeNull()
  })

  it('names the type first, because fixing the size would not help', () => {
    const huge = { type: 'application/x-msdownload', size: MAX_SUBMISSION_BYTES * 10 }
    expect(rejectSubmission(huge, 0)).toBe('type')
  })

  it('refuses an oversized file', () => {
    expect(rejectSubmission({ type: 'image/png', size: MAX_SUBMISSION_BYTES + 1 }, 0)).toBe('size')
    expect(rejectSubmission({ type: 'image/png', size: MAX_SUBMISSION_BYTES }, 0)).toBeNull()
  })

  it('refuses once the per-task file count is reached', () => {
    expect(rejectSubmission({ type: 'image/png', size: 10 }, MAX_SUBMISSION_FILES)).toBe('count')
    expect(rejectSubmission({ type: 'image/png', size: 10 }, MAX_SUBMISSION_FILES - 1)).toBeNull()
  })

  it('matches the ceiling the bucket itself enforces', () => {
    // 0142 declares the same 5 MiB on storage.buckets.file_size_limit. If these
    // ever diverge, a student gets a raw 413 instead of a readable refusal.
    expect(MAX_SUBMISSION_BYTES).toBe(5242880)
    expect(MAX_SUBMISSION_FILES).toBe(5)
  })
})

describe('submissionPath', () => {
  it('puts school and student first — the storage policies key on those folders', () => {
    const path = submissionPath('school-1', 'student-2', 'task-3', 'jpg')
    expect(path.startsWith('school-1/student-2/task-3/')).toBe(true)
    expect(path.endsWith('.jpg')).toBe(true)
  })

  it('never collides for the same student and task', () => {
    const a = submissionPath('s', 'st', 't', 'png')
    const b = submissionPath('s', 'st', 't', 'png')
    expect(a).not.toBe(b)
  })
})
