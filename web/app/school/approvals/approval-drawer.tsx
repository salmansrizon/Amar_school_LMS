import { CalendarDays, ClipboardList, Layers } from 'lucide-react'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, type DrawerFact } from '@/components/data-table/drawer-parts'
import { DecideControls } from './decide-controls'

// Approval record drawer body (drawer redesign): Entity/Stage/Date facts
// above the existing DecideControls (approve/reject form — unchanged). No
// separate primary action: deciding IS the record's one action, and it's
// already a form, not a link, so the sticky footer carries Cancel only.

export function ApprovalDrawerBody({
  entityType,
  stage,
  date,
  lang,
  instanceId,
}: {
  entityType: string
  stage: number
  date: string
  lang: Lang
  instanceId: string
}) {
  const fmt = numberFmt(lang)
  const facts: DrawerFact[] = [
    { icon: <Layers className="size-3.5" aria-hidden />, label: t('approvals.colEntity', lang), value: entityType },
    { icon: <ClipboardList className="size-3.5" aria-hidden />, label: t('approvals.colStage', lang), value: <Pill tone="sun">{fmt.format(stage)}</Pill> },
    { icon: <CalendarDays className="size-3.5" aria-hidden />, label: t('notices.colDate', lang), value: date },
  ]
  return (
    <div className="space-y-4">
      <DrawerFacts facts={facts} />
      <DecideControls instanceId={instanceId} lang={lang} />
    </div>
  )
}

export function approvalDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
