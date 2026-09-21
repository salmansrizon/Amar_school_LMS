# Agent UI Audit

## Intended users

Agents who need a focused dashboard and assigned task queue.

## Recommended UI model

| Journey | Current routes | Recommended pattern |
| --- | --- | --- |
| Task overview | `/agent` | Dashboard with assigned, due, blocked, completed task counts. |
| Task execution | `/agent/tasks`, `/agent/tasks/[id]` | Task list ? task detail/action ? completion/recovery. |

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| Agent role has only two route families, so extra navigation would hurt more than help. | Low — simplicity risk | Keep minimal nav; invest in dashboard/task-list quality. |
| Task detail should clearly show status, next action, and completion criteria. | High — workflow clarity | Use task queue states: due soon, blocked, done, needs review. |
| Role search/notifications are not rich yet. | Medium — findability | Add task search and due notifications when data source is ready. |

## Recommended UI references

Adapt `find/orient ? act/edit ? review/recover` from [`screen sequences`](../../Design%20System/new%20ui/07-screen-sequences/README.md). Use simple cards from [`overview`](../../Design%20System/new%20ui/01-overview/school-owner-dashboard-desktop.png).

## Compact route inventory

| Route | Intended user | Purpose | Main actions | Recommended journey | Audit note |
| --- | --- | --- | --- | --- | --- |
| `/agent` | Agent | Dashboard | Review assigned work | Task overview | Entry page. |
| `/agent/tasks` | Agent | Task list | Filter/open tasks | Task execution | Queue pattern. |
| `/agent/tasks/[id]` | Agent | Task detail | Execute/update task | Task execution | Action/recovery route. |
