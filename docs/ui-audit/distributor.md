# Distributor UI Audit

## Intended users

Distributors/partners managing their pipeline, onboarding work, wallet, and invoices.

## Recommended UI model

| Journey | Current routes | Recommended pattern |
| --- | --- | --- |
| Business overview | `/distributor` | Dashboard with pipeline, onboarding, wallet/invoice summaries. |
| CRM pipeline | `/distributor/crm`, `/distributor/crm/[id]` | Lead list ? lead detail ? next action/recovery. |
| Onboarding | `/distributor/onboarding` | Checklist/status journey. |
| Wallet & invoices | `/distributor/wallet`, `/distributor/invoices`, `/distributor/invoices/[id]` | Financial summary ? invoice detail/review. |

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| Distributor surface is small and well-suited to journey grouping. | Medium — consistency | Keep current nav but visually group finance vs pipeline. |
| Search/notifications are not role-rich yet. | Medium — findability | Add CRM lead/invoice search when available. |
| Invoice and wallet are separate routes but one financial journey. | Medium — workflow friction | Cross-link invoice detail from wallet and dashboard. |

## Recommended UI references

Use the shared AppShell pattern and adapt finance cards from [`fees finance`](../../Design%20System/new%20ui/04-finance-communication/fees-finance-desktop.png). For CRM, adapt the directory/list pattern from [`student directory`](../../Design%20System/new%20ui/02-people/student-directory-desktop.png).

## Compact route inventory

| Route | Intended user | Purpose | Main actions | Recommended journey | Audit note |
| --- | --- | --- | --- | --- | --- |
| `/distributor` | Distributor | Dashboard | Review summary | Business overview | Entry page. |
| `/distributor/crm` | Distributor | Lead/customer pipeline | Search/open/update leads | CRM pipeline | Directory pattern. |
| `/distributor/crm/[id]` | Distributor | Lead detail | Review/update next action | CRM pipeline | Detail/review. |
| `/distributor/onboarding` | Distributor | Onboarding | Complete/check setup | Onboarding | Checklist pattern. |
| `/distributor/wallet` | Distributor | Wallet | Review balance/transactions | Wallet & invoices | Finance summary. |
| `/distributor/invoices` | Distributor | Invoice list | Review invoices | Wallet & invoices | Finance list. |
| `/distributor/invoices/[id]` | Distributor | Invoice detail | Review/print invoice | Wallet & invoices | Review/outcome. |
