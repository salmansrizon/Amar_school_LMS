// Default Subject Selection (issue #503, docs/012): predefined subject
// suggestions for the Class & Curriculum "Add Subject" datalist, kept pure for
// unit testing. The list is bracketed by grade (parsed from the class name)
// and, for SSC/HSC, by group_department — an unrecognised grade or group
// falls back to the full merged list rather than an empty one, since the
// datalist only ever suggests: free text typed by the user is always allowed.

export interface SubjectClassContext {
  name: string
  group_department?: string | null
}

const PRIMARY_SUBJECTS = [
  'বাংলা',
  'English',
  'Mathematics / গণিত',
  'Science / প্রাথমিক বিজ্ঞান',
  'Bangladesh and Global Studies',
  'Religion and Moral Education',
  'ইসলাম ও নৈতিক শিক্ষা',
  'হিন্দুধর্ম ও নৈতিক শিক্ষা',
  'বৌদ্ধধর্ম ও নৈতিক শিক্ষা',
  'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা',
  'Physical Education',
  'Arts / Arts and Crafts',
  'ICT / Digital Technology',
  'Environment / Social Studies',
]

const SECONDARY_6_8_SUBJECTS = [
  'বাংলা',
  'English',
  'Mathematics',
  'Science',
  'Bangladesh and Global Studies',
  'Information and Communication Technology',
  'Religion and Moral Education',
  'Physical Education and Health',
  'Career Education',
  'Arts and Crafts',
  'Agriculture Studies',
  'Home Science',
  'Arabic',
  'Sanskrit',
  'Pali',
  "Small Ethnic Group's Language and Culture",
]

const SSC_COMMON = [
  'বাংলা',
  'English',
  'Mathematics',
  'Religion and Moral Education',
  'Information and Communication Technology',
  'Career Education',
  'Physical Education / Health',
  'Agriculture Studies',
  'Home Science',
  'Arabic',
  'Sanskrit',
  'Pali',
  'Higher Mathematics',
  'Arts-related subjects',
]

const SSC_SCIENCE = ['Physics', 'Chemistry', 'Biology', 'Higher Mathematics', 'Science']

const SSC_HUMANITIES = [
  'History of Bangladesh and World Civilization',
  'Geography and Environment',
  'Economics',
  'Civics and Citizenship',
  'Sociology',
  'Social Work',
  'Logic',
]

const SSC_BUSINESS = [
  'Accounting',
  'Finance and Banking',
  'Business Entrepreneurship',
  'Business Organization and Management',
]

const HSC_SCIENCE = [
  'বাংলা',
  'English',
  'Information and Communication Technology',
  'Physics',
  'Chemistry',
  'Biology',
  'Higher Mathematics',
]

const HSC_HUMANITIES = [
  'বাংলা',
  'English',
  'Information and Communication Technology',
  'Economics',
  'Civics and Good Governance',
  'Logic',
  'History',
  'Islamic History and Culture',
  'Geography',
  'Sociology',
  'Social Work',
  'Psychology',
  'Home Science',
  'Statistics',
]

const HSC_BUSINESS = [
  'বাংলা',
  'English',
  'Information and Communication Technology',
  'Accounting',
  'Finance, Banking and Insurance',
  'Business Organization and Management',
  'Production Management and Marketing',
  'Economics',
  'Statistics',
]

const ALL_SUBJECTS = [
  ...new Set([
    ...PRIMARY_SUBJECTS,
    ...SECONDARY_6_8_SUBJECTS,
    ...SSC_COMMON,
    ...SSC_SCIENCE,
    ...SSC_HUMANITIES,
    ...SSC_BUSINESS,
    ...HSC_SCIENCE,
    ...HSC_HUMANITIES,
    ...HSC_BUSINESS,
  ]),
]

const WORD_GRADES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const GRADE_TOKEN = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve'
// Text right after the word "class" (this codebase's actual convention —
// "Class 9", "SP2 Class Six") is the highest-confidence read: an unrelated
// number elsewhere in the name (a shift/group/batch prefix, e.g. "Group 2
// Class 9") can't be mistaken for the grade if a "Class ___" match exists.
const CLASS_PREFIXED_GRADE = new RegExp(`\\bclass\\b\\s*[-:]?\\s*(\\d+|${GRADE_TOKEN})\\b`, 'i')

function gradeFromToken(token: string): number | null {
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    return n >= 1 && n <= 12 ? n : null
  }
  return WORD_GRADES[token.toLowerCase()] ?? null
}

/** A class's grade (1-12) from its name — free text in this codebase (e.g.
 *  "Six", "Nine A", "SP2 Class Six", "Group 2 Class 9"). A "Class ___" match
 *  (see CLASS_PREFIXED_GRADE) is authoritative and returned as-is, valid or
 *  not — an out-of-range "Class 15" must NOT fall through to scanning the
 *  rest of the name, or an unrelated earlier number (a shift/group/batch
 *  prefix, e.g. "Group 2 Class 15") would get picked up as the grade, which
 *  is exactly the ambiguity this match exists to avoid.
 *
 *  Without a "Class ___" match, a number *word* is checked before a bare
 *  digit: a word ("Six", "Nine") only ever means a grade in practice, while a
 *  bare standalone digit is far more likely to be unrelated noise (a shift,
 *  group, or batch number — e.g. "Group 2 Six" must read as grade 6, not 2).
 *  A digit token must also be word-bounded on both sides so one fused into
 *  another token (a prefix like "SP2") doesn't get read as the grade, and an
 *  out-of-range one (a "Batch 2026" prefix) is simply skipped rather than
 *  treated as a match. Returns null when nothing parses. */
export function parseGrade(className: string): number | null {
  const prefixed = className.match(CLASS_PREFIXED_GRADE)
  if (prefixed) return gradeFromToken(prefixed[1])
  const word = className.toLowerCase().match(new RegExp(`\\b(${GRADE_TOKEN})\\b`))
  if (word) return WORD_GRADES[word[1]]
  const digits = className.match(/\b\d+\b/)
  if (digits) {
    const n = Number(digits[0])
    if (n >= 1 && n <= 12) return n
  }
  return null
}

function matchesGroup(groupDepartment: string | null | undefined, keywords: string[]): boolean {
  if (!groupDepartment) return false
  const g = groupDepartment.toLowerCase()
  return keywords.some((k) => g.includes(k))
}

/** SSC/HSC group subjects, keyed off the class's free-text group_department;
 *  no recognised group returns the union of all three groups. */
function groupSubjects(
  groupDepartment: string | null | undefined,
  science: string[],
  humanities: string[],
  business: string[],
): string[] {
  if (matchesGroup(groupDepartment, ['science'])) return science
  if (matchesGroup(groupDepartment, ['business', 'commerce'])) return business
  if (matchesGroup(groupDepartment, ['humanities', 'arts'])) return humanities
  return [...new Set([...science, ...humanities, ...business])]
}

/** Default subject suggestions for a Class Catalogue row's grade bracket —
 *  feeds the Add Subject datalist. Always a superset a user can still type
 *  past (the input stays free text), never empty. */
export function subjectSuggestionsForClass(cls: SubjectClassContext | null): string[] {
  if (!cls) return ALL_SUBJECTS
  const grade = parseGrade(cls.name)
  if (grade === null) return ALL_SUBJECTS
  if (grade <= 5) return PRIMARY_SUBJECTS
  if (grade <= 8) return SECONDARY_6_8_SUBJECTS
  if (grade <= 10)
    return [
      ...new Set([...SSC_COMMON, ...groupSubjects(cls.group_department, SSC_SCIENCE, SSC_HUMANITIES, SSC_BUSINESS)]),
    ]
  return groupSubjects(cls.group_department, HSC_SCIENCE, HSC_HUMANITIES, HSC_BUSINESS)
}
