// Labelled Behaviour Log notes for the advisory triage eval (issue #672).
//
// Mix: 15 Bangla, 10 mixed Bangla-English (incl. romanised Banglish), 5 English.
// Written the way teachers actually type — colloquial verb forms (করছে/দিছে),
// inconsistent spelling (ছুরে/ছুঁড়ে), English words in Bangla script and vice
// versa, one-word notes — not textbook sentences.
//
// Labels describe what a careful teacher would conclude. Where reasonable
// people differ, the label admits several answers (category list, severity
// range, contactGuardian = null for "either is defensible").

import type { RatingMismatch, TriageCategory } from '@/lib/behaviour-triage'

export interface TriageCase {
  id: string
  lang: 'bn' | 'mixed' | 'en'
  note: string
  /** The rating a teacher entered alongside the note (0–10, 10 = excellent). */
  rating: number
  categories: TriageCategory[]
  /** Inclusive range of acceptable rounded severity levels (0–4). */
  severity: [number, number]
  /** null: either answer is defensible. */
  contactGuardian: boolean | null
  /** The mismatch warning the app should show (entry unlocked). */
  mismatch: RatingMismatch | null
  why?: string
}

export const CASES: TriageCase[] = [
  // --- Bangla -----------------------------------------------------------------
  {
    id: 'bn-01', lang: 'bn', rating: 3,
    note: 'আজকে টিফিন পিরিয়ডে রাহাতকে ধাক্কা দিয়ে ফেলে দিয়েছে। এর আগেও ওকে নিয়ে ক্লাসে সবাইকে হাসায়, প্রায় প্রতিদিন ওর টিফিন কেড়ে নেয়।',
    categories: ['bullying'], severity: [3, 4], contactGuardian: true, mismatch: null,
    why: 'repeated targeting of one child',
  },
  {
    id: 'bn-02', lang: 'bn', rating: 4,
    note: 'গত সপ্তাহে ৪ দিন স্কুলে আসেনি, কোনো দরখাস্ত দেয়নি',
    categories: ['absence'], severity: [2, 2], contactGuardian: true, mismatch: null,
  },
  {
    id: 'bn-03', lang: 'bn', rating: 5,
    note: 'বাড়ির কাজ করে আনেনি আজ',
    categories: ['academic'], severity: [1, 1], contactGuardian: false, mismatch: null,
  },
  {
    id: 'bn-04', lang: 'bn', rating: 9,
    note: 'ক্লাসে খুব মনোযোগী, আজ অংকের সব প্রশ্নের উত্তর ঠিক দিয়েছে। শাবাশ!',
    categories: ['positive'], severity: [0, 0], contactGuardian: false, mismatch: null,
  },
  {
    id: 'bn-05', lang: 'bn', rating: 2,
    note: 'স্যার এর সাথে বেয়াদবি করছে, খাতা ছুরে ফেলে দিছে',
    categories: ['conduct'], severity: [3, 3], contactGuardian: true, mismatch: null,
    why: 'colloquial spelling: ছুরে (ছুঁড়ে), করছে/দিছে',
  },
  {
    id: 'bn-06', lang: 'bn', rating: 1,
    note: 'ব্যাগে ছুরি পাওয়া গেছে',
    categories: ['conduct'], severity: [4, 4], contactGuardian: true, mismatch: null,
    why: 'weapon — safety risk in five words',
  },
  {
    id: 'bn-07', lang: 'bn', rating: 6,
    note: 'প্রায়ই দেরি করে আসে, সকাল ৮.৩০ এর পরে',
    categories: ['absence'], severity: [1, 2], contactGuardian: null, mismatch: null,
  },
  {
    id: 'bn-08', lang: 'bn', rating: 3,
    note: 'পরীক্ষায় পাশের জনের খাতা দেখে লিখছিল',
    categories: ['conduct', 'academic'], severity: [2, 3], contactGuardian: null, mismatch: null,
    why: 'cheating: criteria put it under conduct; academic is a defensible read',
  },
  {
    id: 'bn-09', lang: 'bn', rating: 4,
    note: 'মাঠে বন্ধুদের সাথে মারামারি করছে, কেউ আহত হয়নি',
    categories: ['conduct'], severity: [2, 3], contactGuardian: null, mismatch: null,
  },
  {
    id: 'bn-10', lang: 'bn', rating: 10,
    note: 'সহপাঠীকে পড়া বুঝিয়ে দিয়েছে, খুব ভালো আচরণ',
    categories: ['positive'], severity: [0, 0], contactGuardian: false, mismatch: null,
  },
  {
    id: 'bn-11', lang: 'bn', rating: 9,
    note: 'ক্লাসের এক মেয়েকে প্রতিদিন উত্যক্ত করে, মোবাইলে খারাপ মেসেজ পাঠায়',
    categories: ['bullying'], severity: [3, 4], contactGuardian: true, mismatch: 'seriousNoteHighRating',
    why: 'rating-vs-note mismatch: harassment rated 9',
  },
  {
    id: 'bn-12', lang: 'bn', rating: 2,
    note: 'খুব সুন্দর করে দেয়ালিকা সাজিয়েছে, সবাই প্রশংসা করেছে',
    categories: ['positive'], severity: [0, 0], contactGuardian: false, mismatch: 'positiveNoteLowRating',
    why: 'rating-vs-note mismatch: praise rated 2',
  },
  {
    id: 'bn-13', lang: 'bn', rating: 8,
    note: 'ভালো',
    categories: ['positive', 'none'], severity: [0, 0], contactGuardian: false, mismatch: null,
    why: 'one-word note',
  },
  {
    id: 'bn-14', lang: 'bn', rating: 6,
    note: 'ঠিক আছে, আজ কিছু বলার নাই',
    categories: ['none'], severity: [0, 1], contactGuardian: false, mismatch: null,
  },
  {
    id: 'bn-15', lang: 'bn', rating: 5,
    note: 'গত দুই মাস ধরে ছেলেটা খুব চুপচাপ থাকে, কারো সাথে কথা বলে না, টিফিন খায় না। আজ বলল বাসায় আব্বু মারে। হাতে দাগ দেখলাম।',
    categories: ['none', 'conduct'], severity: [4, 4], contactGuardian: null, mismatch: null,
    why: 'suspected abuse at home: safety risk, but calling the guardian may be the wrong step — safeguarding policy, not this hint, decides',
  },

  // --- Mixed Bangla-English -----------------------------------------------------
  {
    id: 'mx-01', lang: 'mixed', rating: 4,
    note: 'Homework দেয়নি পরপর 3 দিন, guardian কে জানানো দরকার',
    categories: ['academic'], severity: [2, 2], contactGuardian: true, mismatch: null,
  },
  {
    id: 'mx-02', lang: 'mixed', rating: 3,
    note: 'Class এ খুব disturb করে, বারবার warning দেওয়ার পরও',
    categories: ['conduct'], severity: [2, 2], contactGuardian: null, mismatch: null,
  },
  {
    id: 'mx-03', lang: 'mixed', rating: 9,
    note: 'Science project এ excellent কাজ করেছে',
    categories: ['positive'], severity: [0, 0], contactGuardian: false, mismatch: null,
  },
  {
    id: 'mx-04', lang: 'mixed', rating: 5,
    note: 'আজ absent, no leave application',
    categories: ['absence'], severity: [1, 1], contactGuardian: null, mismatch: null,
  },
  {
    id: 'mx-05', lang: 'mixed', rating: 3,
    note: 'অন্য ছেলেদের নিয়ে group করে ওকে tease করে, ওর নাম নিয়ে মজা করে',
    categories: ['bullying'], severity: [3, 3], contactGuardian: true, mismatch: null,
  },
  {
    id: 'mx-06', lang: 'mixed', rating: 8,
    note: 'Teacher কে গালি দিয়েছে in front of whole class',
    categories: ['conduct'], severity: [3, 3], contactGuardian: true, mismatch: 'seriousNoteHighRating',
    why: 'rating-vs-note mismatch: abusing a teacher rated 8',
  },
  {
    id: 'mx-07', lang: 'mixed', rating: 4,
    note: 'Math test এ fail করেছে, attention কম',
    categories: ['academic'], severity: [1, 2], contactGuardian: null, mismatch: null,
  },
  {
    id: 'mx-08', lang: 'mixed', rating: 5,
    note: 'bus e uthe jhogra korse',
    categories: ['conduct'], severity: [1, 2], contactGuardian: null, mismatch: null,
    why: 'romanised Banglish: "argued/fought on the bus"',
  },
  {
    id: 'mx-09', lang: 'mixed', rating: 10,
    note: 'Sports day te 1st hoise, well done',
    categories: ['positive'], severity: [0, 0], contactGuardian: false, mismatch: null,
    why: 'romanised Banglish praise',
  },
  {
    id: 'mx-10', lang: 'mixed', rating: 5,
    note: 'ok',
    categories: ['none', 'positive'], severity: [0, 1], contactGuardian: false, mismatch: null,
    why: 'contentless note',
  },

  // --- English ------------------------------------------------------------------
  {
    id: 'en-01', lang: 'en', rating: 1,
    note: 'Pushed a younger student down the stairs, school nurse had to be called',
    categories: ['conduct', 'bullying'], severity: [3, 4], contactGuardian: true, mismatch: null,
  },
  {
    id: 'en-02', lang: 'en', rating: 6,
    note: 'Forgot textbook',
    categories: ['academic'], severity: [1, 1], contactGuardian: false, mismatch: null,
  },
  {
    id: 'en-03', lang: 'en', rating: 3,
    note: 'Left school after 3rd period without permission',
    categories: ['absence'], severity: [2, 3], contactGuardian: true, mismatch: null,
  },
  {
    id: 'en-04', lang: 'en', rating: 9,
    note: 'Very helpful during the science fair setup, stayed late to help clean up',
    categories: ['positive'], severity: [0, 0], contactGuardian: false, mismatch: null,
  },
  {
    id: 'en-05', lang: 'en', rating: 3,
    note: 'Was quiet today',
    categories: ['none'], severity: [0, 1], contactGuardian: false, mismatch: null,
    why: 'neutral, not praise: a severity-0 read would wrongly raise positiveNoteLowRating',
  },
]
