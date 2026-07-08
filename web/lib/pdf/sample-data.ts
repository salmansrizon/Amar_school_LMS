import type { MarkSheetData } from './types'

/**
 * Realistic sample used by the #25 prototype route and by tests, so the seam is
 * exercised end-to-end with genuine Bangla data (not Latin placeholders). Real
 * marks-entry/result modules (§5.5, issues #32/#33) will assemble this shape
 * from the database instead.
 */
export const sampleMarkSheet: MarkSheetData = {
  institute: {
    name: 'আদর্শ উচ্চ বিদ্যালয়',
    address: 'গ্রাম: শালবন, ইউনিয়ন: ধর্মপুর, উপজেলা: সদর, জেলা: কুমিল্লা',
    registration: 'EIIN: 105432 · Institute Code: 4501',
  },
  exam: {
    title: 'বার্ষিক পরীক্ষা ২০২৬',
    className: 'ষষ্ঠ শ্রেণি',
    section: 'ক',
    year: 2026,
  },
  student: {
    name: 'সাদিয়া ইসলাম',
    roll: '07',
    className: 'ষষ্ঠ শ্রেণি',
    section: 'ক',
    guardianName: 'মোঃ রফিকুল ইসলাম',
  },
  subjects: [
    { subject: 'বাংলা', fullMarks: 100, obtainedMarks: 82, grade: 'A+', gradePoint: 5 },
    { subject: 'ইংরেজি', fullMarks: 100, obtainedMarks: 74, grade: 'A', gradePoint: 4 },
    { subject: 'গণিত', fullMarks: 100, obtainedMarks: 91, grade: 'A+', gradePoint: 5 },
    { subject: 'বিজ্ঞান', fullMarks: 100, obtainedMarks: 68, grade: 'A-', gradePoint: 3.5 },
    { subject: 'বাংলাদেশ ও বিশ্বপরিচয়', fullMarks: 100, obtainedMarks: 79, grade: 'A', gradePoint: 4 },
    { subject: 'ধর্ম', fullMarks: 100, obtainedMarks: 88, grade: 'A+', gradePoint: 5 },
  ],
  summary: {
    totalMarks: 600,
    obtainedMarks: 482,
    gpa: 4.42,
    finalGrade: 'A',
    passed: true,
    position: 3,
  },
}
