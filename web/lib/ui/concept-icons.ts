import {
  Activity,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CircleHelp,
  ClipboardCheck,
  FolderOpen,
  House,
  IdCard,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  MessagesSquare,
  NotebookPen,
  PencilLine,
  Presentation,
  School,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

// One icon per concept, for both portals. The owner sidebar, the student
// sidebar, page headers, tabs, stat cards and empty states all read this, so
// "attendance" is the same glyph wherever it appears. Keys match ScreenKey and
// StudentNavItemKey where the concept is a screen. Decorative: callers render
// them aria-hidden next to a text label.
export const CONCEPT_ICON = {
  dashboard: LayoutDashboard,
  home: House,
  students: Users,
  employees: IdCard,
  attendance: CalendarCheck,
  classes: BookOpen,
  exams: NotebookPen,
  fees: Wallet,
  sms: MessageSquareText,
  notices: Megaphone,
  feedback: MessagesSquare,
  institute: School,
  staff: ShieldCheck,
  questions: CircleHelp,
  corrections: PencilLine,
  approvals: BadgeCheck,
  activity: Activity,
  'my-classes': Presentation,
  profile: UserRound,
  'permission-denied': ShieldAlert,
  tasks: ClipboardCheck,
  routine: CalendarClock,
  materials: FolderOpen,
  results: Trophy,
  leave: CalendarOff,
} as const satisfies Record<string, LucideIcon>

export type ConceptKey = keyof typeof CONCEPT_ICON

export function isConcept(name: string): name is ConceptKey {
  return Object.prototype.hasOwnProperty.call(CONCEPT_ICON, name)
}
