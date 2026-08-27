import type { Role } from '@/lib/auth/routing'
import type { MessageKey } from '@/lib/i18n'

// The School product's screen registry (PRD §5, #515).
//
// One row per first path segment under /school, because `proxy.ts` gates on the
// first segment and nothing else. Every screen the product has is here, and a
// segment that is NOT here is refused — see screenKeyForPath.
//
// Before #515 the same ten keys lived in three places (this file, the feature
// engine's catalog, and 0081's seed) with nothing comparing any pair, the nav
// and the search palette were hand-mirrored, and eight segments were reachable
// with no entry anywhere. A typo in a nav href returned null from
// screenKeyForPath, and `proxy.ts` reads null as UNGATED — so the failure mode
// of a typo was silently MORE access. That is the shape this registry exists to
// close.

/**
 * What decides whether a caller may open this screen.
 *
 * - `grant`  — the Permission Grant. A Staff User needs the key in
 *              `staff_permissions`; these are also the keys the feature engine
 *              switches per school.
 * - `owner`  — School Owner only. Never grantable, whatever a Staff User holds.
 * - `member` — any authenticated member of the school. **Not ungated**: the
 *              contents gate themselves through RLS, which is a stronger answer
 *              than a screen key, not a weaker one. #513's three routes are
 *              here, and so are five more that were reachable with no answer at
 *              all.
 *
 * `member` is the third answer the proxy did not have. `/school/questions` and
 * `/school/corrections` ride no grant BY DESIGN (#509): `feedback` is both a
 * screen key and a feature key, and riding it would take student questions down
 * whenever a school switched guardian feedback off. Giving them a grant was the
 * wrong fix; giving the proxy a word for what they are is the right one.
 */
export type ScreenGate = 'grant' | 'owner' | 'member'

export interface ScreenDef {
  /** The first path segment under /school. `dashboard` is the bare /school. */
  key: string
  gate: ScreenGate
  /** Shown wherever this screen is named to a human. Present on every `grant`
   *  row, because the Owner grants by name; optional elsewhere. */
  titleKey?: MessageKey
}

export const SCREENS = [
  // The Permission Grant's ten. Order is the order the Owner sees them in.
  { key: 'students', gate: 'grant', titleKey: 'students.title' },
  { key: 'employees', gate: 'grant', titleKey: 'employees.title' },
  { key: 'attendance', gate: 'grant', titleKey: 'attendance.title' },
  { key: 'classes', gate: 'grant', titleKey: 'classes.title' },
  { key: 'exams', gate: 'grant', titleKey: 'exams.title' },
  { key: 'fees', gate: 'grant', titleKey: 'fees.title' },
  { key: 'sms', gate: 'grant', titleKey: 'sms.title' },
  { key: 'notices', gate: 'grant', titleKey: 'notices.title' },
  { key: 'feedback', gate: 'grant', titleKey: 'feedback.title' },
  { key: 'institute', gate: 'grant', titleKey: 'institute.title' },

  // Owner-only. Granting the screen that hands out grants is a loop.
  { key: 'staff', gate: 'owner', titleKey: 'staff.title' },

  // Member: reachable by anyone signed in to the school, contents self-gating.
  //
  // - dashboard      the bare /school. Was a `ScreenKey | 'dashboard'` sentinel
  //                  written independently in two files; it is a row now.
  // - questions      student questions, scoped by class attachment (0152).
  // - corrections    profile change requests, same (0152); only the Owner applies.
  // - my-classes     being the Class Teacher IS the authorization (#443).
  // - approvals      the workflow instance's own approver decides (RPC, #317).
  // - activity       the dashboard's "View All"; the three streams behind it are
  //                  each RLS-scoped already.
  // - profile        the caller's own account.
  // - subscription   the school's own plan.
  // - permission-denied  where this file sends people. Gating it is a loop.
  { key: 'dashboard', gate: 'member' },
  { key: 'questions', gate: 'member' },
  { key: 'corrections', gate: 'member' },
  { key: 'my-classes', gate: 'member' },
  { key: 'approvals', gate: 'member' },
  { key: 'activity', gate: 'member' },
  { key: 'profile', gate: 'member' },
  { key: 'subscription', gate: 'member' },
  { key: 'permission-denied', gate: 'member' },
] as const satisfies readonly ScreenDef[]

export type ScreenKey = (typeof SCREENS)[number]['key']

/**
 * The feature engine's keys, derived rather than copied (#515).
 *
 * Was `FEATURE_KEYS` in lib/engines/feature/catalog.ts — the same ten strings in
 * the same order, with no test comparing the two lists. A per-school feature
 * switch only makes sense over a screen the Owner can grant, so the grantable
 * set IS the feature set; keeping a second array was a hand-sync risk dressed as
 * a module. 0081's seed stays the source of the labels the Super Admin edits,
 * and an integration test now pins its keys to these.
 */
export type FeatureKey = Extract<(typeof SCREENS)[number], { gate: 'grant' }>['key']

type ScreenEntry = (typeof SCREENS)[number]
type GrantableScreen = Extract<ScreenEntry, { gate: 'grant' }>

// Narrowing on the literal union rather than on ScreenDef, so a `grant` row
// added without a titleKey is a type error here rather than a screen that
// silently stops being grantable.
const isGrantable = (s: ScreenEntry): s is GrantableScreen => s.gate === 'grant'

/** The screens an Owner can hand to a Staff User, in display order. */
export const GRANTABLE_SCREENS: readonly GrantableScreen[] = SCREENS.filter(isGrantable)

export const FEATURE_KEYS: readonly FeatureKey[] = GRANTABLE_SCREENS.map((s) => s.key)

const BY_KEY = new Map<string, ScreenDef>(SCREENS.map((s) => [s.key, s]))

export function screenFor(screen: ScreenKey): ScreenDef {
  // Non-null by construction: ScreenKey is derived from the same array.
  return BY_KEY.get(screen)!
}

/**
 * The screen a URL belongs to, or null when the URL names no screen we have.
 *
 * Null is the interesting case. `proxy.ts` used to read it as "ungated" and let
 * the request through; it now refuses. A route added without a row here is
 * therefore unreachable in production rather than silently open, which is the
 * point: the failure mode of a typo must be less access, not more.
 */
const SCHOOL_PATH = /^\/school(?:\/([^/]+))?(?:\/|$)/

/** True for the School product's own URLs, and not for `/schools`. */
export function isSchoolPath(pathname: string): boolean {
  return SCHOOL_PATH.test(pathname)
}

export function screenKeyForPath(pathname: string): ScreenKey | null {
  const match = pathname.match(SCHOOL_PATH)
  if (!match) return null
  const segment = match[1] ?? 'dashboard'
  return BY_KEY.has(segment) ? (segment as ScreenKey) : null
}

export function canOpenScreen(role: Role, grantedKeys: readonly string[], screen: ScreenKey): boolean {
  if (role === 'school_owner') return true
  if (role !== 'staff_user') return false
  switch (screenFor(screen).gate) {
    case 'owner':
      return false
    case 'member':
      return true
    case 'grant':
      return grantedKeys.includes(screen)
  }
}
