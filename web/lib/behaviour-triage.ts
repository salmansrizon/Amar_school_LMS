// Advisory AI triage for Behaviour Log Entries (issue #672): the TypeSafe
// questions asked of a note, and the pure policy that turns the typed answers
// into staff-facing hints. Every threshold and every decision lives here, in
// code — the model only supplies the three judgments. Nothing in this module
// (or its callers) changes the entry, sends SMS or sets reminders.

import { createHash } from 'node:crypto'
import { choice, noul, score, type EntryType } from '@typesafe-ai/sdk'
import { ratingBand } from '@/lib/behaviour'

/** Per-school flag in school_feature_flags; absent row = off (the default). */
export const BEHAVIOUR_TRIAGE_FLAG = 'behaviour_ai_triage'

export const TRIAGE_CATEGORIES = ['bullying', 'absence', 'academic', 'conduct', 'positive', 'none'] as const
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number]

/** Ordered low → high; index is the severity level (0–4). Typed as the SDK's
 *  criteria so the nested example arrays stay JSON-assignable. */
const SEVERITY_LEVELS: [EntryType, EntryType, EntryType, EntryType, EntryType] = [
  {
    what: 'Positive behaviour, praise or recognition; nothing of concern',
    examples: ['Helped a classmate', 'ক্লাসে খুব মনোযোগী ছিল'],
  },
  {
    what: 'Minor, routine lapse a teacher handles with a reminder',
    examples: ['Homework late once', 'Talking during class', 'আজ বই আনেনি'],
  },
  {
    what: 'Repeated or disruptive behaviour that needs follow-up by the teacher',
    examples: ['Third week without homework', 'Keeps disrupting lessons after warnings'],
  },
  {
    what: 'Serious: harming or intimidating others, damaging property, or openly defying staff',
    examples: ['Hit a classmate', 'Broke a window on purpose', 'Refused and insulted the teacher'],
  },
  {
    what: 'Risk to the safety of the student or others',
    examples: ['Brought a knife', 'Talked about hurting themself', 'Signs of abuse at home'],
  },
]

/** The three independent judgments, asked together in one request. The
 *  entered rating is deliberately NOT part of the state: severity must be
 *  judged from the note alone so the mismatch check below means something. */
export const BEHAVIOUR_TRIAGE_QUESTIONS = {
  severity: score(
    'How serious is the student behaviour described in `note`? The note is written by a school teacher, in Bangla, English or a mix of both.',
    SEVERITY_LEVELS,
  ),
  parent_contact: noul(
    'Would a reasonable teacher contact the student\'s parent or guardian about what `note` describes? The note is written by a school teacher, in Bangla, English or a mix of both.',
    {
      true: 'The guardian should hear about it: a pattern, harm to someone, a safety concern, or something that needs support at home',
      false: 'Routine, positive, or fully handled in class',
    },
  ),
  category: choice(
    'What kind of student behaviour does `note` mainly describe? The note is written by a school teacher, in Bangla, English or a mix of both.',
    {
      bullying: {
        what: 'Targeting, threatening, excluding, mocking or harassing another student',
        not_for: 'A one-off fight between equals (conduct)',
      },
      absence: { what: 'Missing school, arriving late, or leaving without permission' },
      academic: {
        what: 'Homework, classwork, exams, study effort or learning progress',
        not_for: 'Cheating (conduct), or praise for good work (positive)',
      },
      conduct: {
        what: 'Discipline: rudeness, fighting, cheating, damage, disobeying rules',
        not_for: 'Repeatedly targeting one student (bullying)',
      },
      positive: { what: 'Praise or recognition of good behaviour, effort or achievement' },
      none: {
        what: 'No meaningful category applies, or the note is not about the student\'s behaviour',
        not_for: 'Praise (positive)',
      },
    },
  ),
} as const

/** A stored triage row (behaviour_entry_triage, migration 0209). */
export interface BehaviourTriage {
  note_sha256: string
  model: string
  severity: number
  severity_confidence: number
  severity_probs: Record<string, number>
  parent_contact_p: number
  category: TriageCategory
  category_confidence: number
  category_probs: Record<string, number>
}

/** Decision thresholds. Starting values, to be tuned against the labelled
 *  eval (scripts/behaviour-triage-eval.ts) before any school is switched on. */
export const TRIAGE_THRESHOLDS = {
  parentContactSuggested: 0.7,
  parentContactNotSuggested: 0.3,
  categoryConfidence: 0.5,
  severityConfidence: 0.5,
  /** Expected severity at or above this is "serious" (level 3+). */
  seriousSeverity: 3,
  /** Expected severity below this is "positive / no concern" (level 0). */
  noConcernSeverity: 0.5,
} as const

export type ParentContactHint = 'suggested' | 'uncertain' | 'notSuggested'

/** The note and the rating point in opposite directions. */
export type RatingMismatch = 'seriousNoteHighRating' | 'positiveNoteLowRating'

export interface TriageView {
  /** Rounded severity level 0–4, or null when the model's spread is too wide. */
  severityLevel: number | null
  parentContact: ParentContactHint
  category: TriageCategory | 'unclassified'
  /** Only on entries still editable (before the 3-day lock). */
  mismatch: RatingMismatch | null
}

/** Hex SHA-256 of the note the judgments were made on — the staleness key. */
export function noteHash(note: string): string {
  return createHash('sha256').update(note, 'utf8').digest('hex')
}

function parentContactHint(p: number): ParentContactHint {
  if (p >= TRIAGE_THRESHOLDS.parentContactSuggested) return 'suggested'
  if (p <= TRIAGE_THRESHOLDS.parentContactNotSuggested) return 'notSuggested'
  return 'uncertain'
}

function ratingMismatch(severity: number, rating: number): RatingMismatch | null {
  const band = ratingBand(rating)
  if (severity >= TRIAGE_THRESHOLDS.seriousSeverity && band === 'excellent') return 'seriousNoteHighRating'
  if (severity < TRIAGE_THRESHOLDS.noConcernSeverity && band === 'needsImprovement') return 'positiveNoteLowRating'
  return null
}

/** What staff see for one entry. Null when there is no triage, or when it was
 *  made on a different version of the note (edited since, re-triage failed). */
export function triageView(
  triage: BehaviourTriage | null | undefined,
  entry: { note: string; rating: number },
  locked: boolean,
): TriageView | null {
  if (!triage || triage.note_sha256 !== noteHash(entry.note)) return null
  const severityKnown = triage.severity_confidence >= TRIAGE_THRESHOLDS.severityConfidence
  return {
    severityLevel: severityKnown ? Math.round(triage.severity) : null,
    parentContact: parentContactHint(triage.parent_contact_p),
    category:
      triage.category_confidence >= TRIAGE_THRESHOLDS.categoryConfidence ? triage.category : 'unclassified',
    mismatch: !locked && severityKnown ? ratingMismatch(triage.severity, entry.rating) : null,
  }
}
