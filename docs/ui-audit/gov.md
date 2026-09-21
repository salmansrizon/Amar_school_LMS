# Government Official UI Audit

## Intended users

Government officials who need oversight into assigned schools/territories.

## Recommended UI model

| Journey | Current routes | Recommended pattern |
| --- | --- | --- |
| Oversight dashboard | `/gov` | Summary cards, filtered school/territory status, drill-down-ready layout. |

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| Gov currently has only one routed screen. | Medium — placeholder/incomplete | Audit the page as a dashboard; mark missing deeper routes as product completeness risk if the UI implies drill-down. |
| A single route can still be overloaded if many oversight metrics appear together. | Medium — information hierarchy | Use grouped cards: schools, attendance/compliance, alerts, recent updates. |
| Search/notifications are not rich yet. | Low — findability | Add only if there are drill-down records. |

## Recommended UI references

Adapt dashboard hierarchy from [`overview flowboard`](../../Design%20System/new%20ui/06-detailed-flowboards/overview-flowboard-desktop.png). Keep it read-only unless product scope adds official actions.

## Compact route inventory

| Route | Intended user | Purpose | Main actions | Recommended journey | Audit note |
| --- | --- | --- | --- | --- | --- |
| `/gov` | Government Official | Oversight dashboard | Review assigned oversight data | Oversight dashboard | Single-route role; avoid over-navigation. |
