// Lead pipeline stages — one source shared by the board, the stage control, and
// the server-action validator so the UI and the guard can't drift.
export const LEAD_STAGES = [
  { key: 'new', label: 'New', tone: 'text-muted' },
  { key: 'contacted', label: 'Contacted', tone: 'text-sky-deep' },
  { key: 'demo', label: 'Demo', tone: 'text-sky-deep' },
  { key: 'negotiation', label: 'Negotiation', tone: 'text-amber-700' },
  { key: 'won', label: 'Won', tone: 'text-emerald-700' },
  { key: 'lost', label: 'Lost', tone: 'text-alert-deep' },
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]['key']

export const LEAD_STAGE_KEYS = LEAD_STAGES.map((s) => s.key) as readonly LeadStage[]

export function isLeadStage(value: string): value is LeadStage {
  return (LEAD_STAGE_KEYS as readonly string[]).includes(value)
}
