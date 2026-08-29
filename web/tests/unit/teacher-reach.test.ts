import { describe, expect, it } from 'vitest'
import { reachSentences } from '@/lib/school/teacher-reach'

describe('reachSentences', () => {
  it('names the classes a class teacher will manage', () => {
    const lines = reachSentences({ classTeacherOf: ['Seven / A'], teaches: [] }, 'en')
    expect(lines.join(' ')).toContain('Seven / A')
    expect(lines.join(' ')).toContain('attendance')
  })

  // ADR 0021: a Subject Teacher gets the students of classes he teaches so he can
  // teach them, and decides nothing about them. The preview has to say both halves
  // or an Owner assigning a routine slot will assume the wrong one.
  it('separates teaching a class from deciding about it', () => {
    const lines = reachSentences({ classTeacherOf: [], teaches: ['Nine / B'] }, 'en')
    expect(lines.join(' ')).toContain('Nine / B')
    expect(lines.join(' ')).toContain('decides nothing')
  })

  it('shows both capacities when someone holds both', () => {
    const lines = reachSentences({ classTeacherOf: ['Six / A'], teaches: ['Nine / B'] }, 'en')
    expect(lines.join(' ')).toContain('Six / A')
    expect(lines.join(' ')).toContain('Nine / B')
  })

  // The case the UAT pass actually hit: an employee created and never assigned,
  // able to log in and see nothing, with no one told.
  it('says plainly when a teacher will see nothing at all', () => {
    const lines = reachSentences({ classTeacherOf: [], teaches: [] }, 'en')
    expect(lines.join(' ')).toContain('no students at all')
  })

  // The half an Owner is most likely to assume wrongly, so it is stated whether or
  // not the teacher has an assignment.
  it('always states what the teacher will never reach', () => {
    for (const reach of [
      { classTeacherOf: ['Six / A'], teaches: [] },
      { classTeacherOf: [], teaches: [] },
    ]) {
      expect(reachSentences(reach, 'en').join(' ')).toContain('never see another class')
    }
  })

  it('speaks Bangla too', () => {
    const lines = reachSentences({ classTeacherOf: ['সাত / ক'], teaches: [] }, 'bn')
    expect(lines.join(' ')).toContain('শ্রেণি শিক্ষক')
    expect(lines.join(' ')).toContain('সাত / ক')
  })
})
