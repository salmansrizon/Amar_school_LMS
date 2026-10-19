Super Admin Portal — Consolidated Implementation Requirement

1. Implementation Principle

Use the existing website UI, layout, navigation, components, visual language, spacing, responsive behavior, and design system as the base. Do not redesign or replace the existing UI structure. Reorganize, extend, or refine the current screens only where required to support the functional requirements below. The implementation should feel like an evolution of the existing product, not a new application. Reuse existing components, tables, cards, drawers, modals, tabs, forms, filters, and interaction patterns wherever possible. The primary objective is to make the Super Admin panel operationally complete while keeping the current interface familiar and consistent.

Super Admin is the platform-level control layer for schools, distributors, agreements, government officials, clusters, agents, SMS, holidays, pricing, subscriptions, modules, financial records, approvals, and audit history. The Super Admin should have complete visibility, while School Owner and Distributor users should see only the financial, operational, and profile information relevant to their role. The system should follow a multi-tenant model where each school remains logically isolated while Super Admin has controlled cross-tenant administrative access.

2. Core Navigation Structure

Super Admin navigation should contain Dashboard, Schools, Distributors, Agreements, Government Officials, Clusters, SMS, Holidays, Pricing & Plans, Modules & Features, Financial Management, and Audit Logs. Agents should not be a primary side-navigation item because agents belong to distributors and should be managed from the Distributor Profile. Subscription Quote should not initially be a standalone navigation item; quote, discount, and promotion operations should remain contextual inside the relevant School or Distributor profile until a dedicated workflow becomes necessary.

3. Super Admin Dashboard

Super Admin Login → Dashboard → Show total schools, active schools, expired schools, suspended schools, distributors, pending agent approvals, active agents, SMS balance, total collected amount, total outstanding amount, overdue payments, upcoming school renewals, expiring agreements, pending certifications, pending financial settlements, and recent platform activity → Clicking any metric opens the relevant management page with the corresponding filter already applied.

4. School Management

Schools → Show the existing school management UI with the current design structure → Maintain the split-list/form pattern where already present → Left or primary action area provides Create School → Main list provides searchable and filterable schools → Search by school name, owner, subdomain, distributor, cluster, status, subscription, or expiry → Select Manage → Open the complete School Profile.

Create School → Enter school name → School owner details → Contact details → Subdomain → Distributor → Cluster → Subscription/Plan → Enabled modules → Billing configuration → SMS configuration → Initial account status → Save → Create school tenant → Generate school login/subdomain → School appears in School List → Audit event created.

School List should show school name, owner, subdomain, distributor, cluster, subscription/plan, enabled modules, account status, subscription expiry, outstanding amount, SMS balance, and last activity. Actions should include Manage, Login as School, Edit, Enable/Disable, Renew, and other actions already supported by the existing UI.

5. Complete School Profile

School List → Manage → Open School Profile Dashboard → The profile is the single source of truth for everything related to the school. Keep the current UI framing, but reorganize the content into logical sections or tabs rather than creating unrelated pages.

School Profile header → Show school name, account status, owner, distributor, cluster, subdomain, current plan, subscription status, subscription expiry, and primary actions → Login as School → Edit → Renew → Enable/Disable → Add SMS Credit → Create Activation Link.

School Profile sections should include Overview, School Information, Subscription & Modules, Financials, SMS, Activation Links, Agreements, Distributor Relationship, and Activity Log.

School Overview → Show identity, owner, contact information, subdomain, distributor, cluster, creation date, account status, subscription status, subscription expiry, active modules, current plan, billing status, SMS balance, and important alerts.

Login as School → Super Admin selects Login as School → System creates a controlled impersonation/session → Redirect to that school's specific login/dashboard context → Display a clear impersonation indicator → Provide a return action to Super Admin → Record the activity in Audit Log.

Subscription & Modules → Show current plan, start date, expiry date, included modules, enabled modules, disabled modules, plan price, discount, custom pricing, and renewal status → Super Admin can enable/disable modules, change plan, renew, or apply approved configuration changes → Save changes → Update school entitlements and record audit event.

6. School Financial Profile

School Profile → Financials → Show Total Invoiced, Total Paid, Total Due, Overdue Amount, Current Month Bill, Next Payment Due, Distributor Commission, Platform Fee, Additional Fees, Discount, and Net Payable. Financial information must be presented as an understandable timeline and summary rather than disconnected values only.

School Financial Timeline → Invoice Created → Invoice Issued → Invoice Viewed → Payment Received → Partial Payment if applicable → Payment Completed or Remaining Due → Adjustment/Discount if applicable → Distributor Commission Calculated → Platform Fee Calculated → Settlement Created where applicable → Settlement Reconciled. Every event should show date/time, transaction type, amount, invoice number, payment status, reference, actor, and related transaction.

School monthly financial flow → System calculates subscription and module charges → Apply configured discount → Calculate additional fees → Calculate distributor commission → Calculate platform fee → Calculate final payable amount → Super Admin reviews calculation → Create Invoice → Invoice becomes Issued → Invoice appears in Super Admin Financial Management and the School Profile → School Owner sees the school-relevant version of the invoice.

Super Admin can manually create an invoice when required. Invoice states should support Draft, Issued, Partially Paid, Paid, Overdue, Cancelled, and Adjusted. Official invoices must remain controlled by Super Admin unless explicit permissions are added later.

School payment flow → School Owner pays monthly due → Super Admin records payment against the specific invoice → Enter amount, payment date, payment method, transaction/reference number, receipt information, and remarks → System updates invoice balance → Full payment changes invoice status to Paid → Partial payment changes invoice status to Partially Paid → Remaining amount remains Due → Generate payment receipt → Link receipt to invoice → Update School Financial Timeline → Update relevant Distributor Financial Timeline if applicable.

School Owner financial visibility → Show own invoices, current balance, due amount, overdue amount, payment history, receipts, payment status, and school-relevant charges → Allow Print/Download of school-facing invoice and receipt → Hide internal distributor commission, platform margin, internal settlement calculation, and other confidential Super Admin information unless explicitly configured as visible.

School invoice navigation → Invoice → View complete Super Admin record → Print/Download Super Admin invoice → View payment history → View source school → View related distributor.

7. School SMS Management

School Profile → SMS → Show current SMS balance, total purchased, total consumed, available balance, latest top-up, and SMS transaction history → Enter receipt amount/reference and SMS quantity when required → Top Up → Confirm → Credit SMS balance to the selected school account → Create immutable SMS transaction → Update School Profile.

SMS Log → Show every credit, deduction, adjustment, API transaction, and status → Filter by date, type, user, and status. The SMS balance and transaction records must remain traceable to the school.

8. School Activation Links

School Profile → Activation Links → Show all activation links with purpose, creation date, expiry date, status, usage count, and creator → Create New Activation Link → Select purpose → Set expiry → Generate → Copy → Revoke when required → Maintain activation-link history.

9. School Agreements

School Profile → Agreements → Show agreements assigned to the school, agreement type, version, effective date, expiry date, status, uploaded document, and agreement history → View → Upload → Replace/Update → Maintain version history and activity log.

10. Distributor Management

Distributors → Preserve the existing UI and current split-list/form structure → Create Distributor form and distributor list should remain within the existing frame → Search by distributor name, cluster, status, contact, or related criteria → Select Manage → Open Distributor Profile.

Create Distributor → Distributor name → Owner/contact information → Business information → Cluster assignment → Agreement assignment → Billing configuration → Status → Save → Create distributor account → Record audit event.

Distributor List should show distributor name, cluster, status, total schools, active schools, agreement status, financial status, and other fields already present in the UI. Select Manage → Open complete Distributor Profile.

11. Complete Distributor Profile

Distributor Profile → Show distributor name, status, cluster, school count, active schools, agreement status, financial status, and primary actions → Edit → Enable/Disable → View Agreement → View Schools.

Distributor Profile sections should include Overview, Schools, Agents, Cluster/Territory, Agreements, Financials, Invoices/Transactions, and Activity Log.

Distributor Overview → Show distributor information, assigned cluster, total schools, active/expired schools, agent count, agreement status, collected amount, outstanding amount, commission summary, settlement status, and recent activity.

Distributor Schools → Show every school assigned to the distributor → Include school name, status, cluster, subscription, expiry, outstanding amount, SMS balance, and last activity → Manage → Open School Profile. The same school record must remain the source of truth; do not duplicate school financial data.

12. Distributor Financial Profile

Distributor Profile → Financials → Show total invoiced, total paid, total due, commission earned, commission pending, platform fees where relevant, adjustments, settlements due, settlements paid, and settlement status.

Distributor Financial Timeline → Invoice/statement generated → School payment received → Distributor commission calculated → Commission payable → Settlement created → Settlement paid → Reconciled. Each event should display date/time, transaction type, amount, invoice/transaction reference, status, related school, and settlement state.

Distributor financial flow → School Owner pays Super Admin → System calculates gross amount → Apply school discount and additional charges → Calculate distributor commission → Calculate platform fee → Determine net settlement → Create authoritative financial record → Distributor sees distributor-relevant portion → Super Admin retains full calculation and transaction detail.

Distributor visibility → Distributor should see the financial information relevant to the distributor such as related school transactions where permitted, commission, settlement, payable amount, invoice/statement reference, payment/settlement status, and settlement date. Internal Super Admin-only information must remain hidden.

13. Central Financial Management

Financial Management → Provide a dedicated side/navigation section for centralized financial control while keeping financial summaries visible inside School and Distributor Profiles. The centralized ledger is the authoritative financial source. School and Distributor profiles consume the same records; they must not maintain separate financial databases or duplicate invoice records.

Financial Dashboard → Show Total Revenue → Total Collected → Total Outstanding → Total Overdue → Current Month Billing → Distributor Commission → Platform Fees → Additional Fees → Pending Settlements → Recent Payments → Recent Invoices.

Invoices → Search/filter by school, distributor, invoice number, billing period, amount, status, and date → Open Invoice → View full calculation → View payment history → Print/Download → Navigate to related School Profile and Distributor Profile.

Payments → Show all payments → Filter by school, distributor, invoice, payment method, date, and status → Open payment → View related invoice → View receipt → View financial timeline.

Due Payments → Show all outstanding and overdue invoices → Sort by due date → Open related School/Distributor Profile → Record payment or initiate follow-up according to existing permissions.

Settlements → Show distributor commission and settlement records → Pending → Approved → Paid → Reconciled → Open settlement → Trace back to underlying school invoices and payments.

14. Unified Invoice Model

The system must maintain one authoritative invoice record and provide different role-based views of the same invoice. Do not create separate independent invoices for Super Admin, School Owner, and Distributor.

Super Admin invoice → Show complete financial breakdown including subscription/module charges, discounts, additional fees, distributor commission, platform fees, payment history, balance, and other authorized internal information.

School Owner invoice → Show school name, billing period, school charges, discount, applicable additional charges, total payable, payment history, payment status, due amount, receipt information, and standard print/download format. Hide internal financial details not intended for the school.

Distributor view → Show distributor-relevant invoice/statement details, related school, eligible gross value where permitted, distributor commission, adjustments, net distributor amount, payment/settlement status, and settlement date. Hide Super Admin-only internal calculations.

All invoice presentations should be visually consistent with the existing product while using role-based field visibility. The invoice number, underlying amount, transaction IDs, and source financial record must remain consistent across roles.

15. Distributor Agreement Management

Agreements → Show current and historical agreements → Create Agreement → Agreement name/type → Select distributor → Effective date → Expiry date when applicable → Upload document → Save → Agreement becomes active according to the effective date.

If a new agreement version is required → Open Agreement → Create New Version → Enter version information → Upload document → Set effective date → Save → Previous version becomes historical → New version becomes current → Maintain complete version log.

Agreement management should support search, filtering, viewing, updating, hardcopy upload for physically signed documents, version history, effective/expiry tracking, and audit history.

16. Government Official Management

Government Officials → Create Official → Enter official name, designation, organization, contact information, cluster, distributor relationship where applicable, status, and supporting information → Save → Official appears in list.

Government Official List → Search/filter → Manage → Open Government Official Profile → Show identity, designation, contact details, assigned cluster, assigned distributor, related documents, activity, and relationship history → Allow Super Admin to assign or reassign cluster/distributor.

17. Agent Management

Agents belong to distributors and should be managed primarily from Distributor Profile → Agents → Show all agents belonging to the distributor → Open Agent Profile → Show agent information, territory, assigned schools, assigned tasks, task status, certification status, certification expiry, approval status, and activity.

Agent creation flow → Distributor creates Agent → Agent status becomes Pending Approval → Super Admin opens Distributor Profile → Agents → Agent Profile → Reviews agent information and certification documents → Approve or Reject → If approved, Agent becomes Active → If rejected, return rejection reason/status to distributor.

Certification flow → Agent has one or multiple certifications → Certification record contains certification name, certificate number, issue date, expiry date, document, verification status, and approval history → Super Admin verifies/approves → Validity normally applies for one year unless the system configuration specifies otherwise → Expiry warning is generated → Agent/Distributor submits renewal/exam evidence → Super Admin approves renewal → New validity period is recorded.

Agent monitoring → Agent Profile → Assigned Tasks → Show task, school/territory, assigned date, deadline, status, completion date, and remarks → Distributor manages operational monitoring → Super Admin retains approval and oversight capability → Distributor and Agent portals may use the same task state where applicable.

18. Cluster Management

Clusters → Create Cluster → Enter cluster name → Select multiple divisions → Select multiple districts → Select multiple unions → Save → Cluster appears in Cluster List.

Cluster List → Search/filter → Manage → View included geography → Assign distributor → View associated schools and agents → Maintain assignment history.

A cluster may contain multiple divisions, districts, and unions. Super Admin controls cluster creation and distributor assignment. Cluster assignment is used to organize distributor territory and associated school coverage.

19. SMS Management

SMS → Show Super Admin SMS/API balance, purchased credits, consumed credits, available credits, API status, SMS requests, request status, and SMS transaction history.

Buy SMS → Select provider/API/package where applicable → Enter quantity → Confirm → Update Super Admin SMS balance → Record transaction.

Send SMS → Select target type such as Distributor, Government Official, Cluster, Territory, or other supported audience → Select recipients → Compose message → Preview → Send → Record request, delivery, and status information.

SMS Requests → Show pending, approved, rejected, completed, and failed requests → Filter by sender, recipient, date, target type, and status.

20. Platform Holiday Management

Holidays → Super Admin manages global/platform-level holidays and government-specific holidays that need to apply across schools. Create Holiday → Enter name → Date → Type → Applicable scope → Save → Holiday becomes a platform default.

School Owners and Distributors may maintain additional local holidays from their respective portals. Super Admin should not become responsible for ordinary school-specific holiday administration unless a platform-level override or governance rule is required.

21. Pricing and Subscription Management

Pricing → Create Pricing Configuration → Define module or feature price → Define billing frequency → Define base price → Define applicable scope → Save.

Subscription Plans → Create Plan → Plan name → Included modules → Pricing → Billing frequency → Limits → Default discount → Status → Save → Manage existing plans through the current UI patterns such as Edit, Duplicate, Disable, and Archive where supported.

Plan assignment → Select School or Distributor → Assign Plan → Set effective date → Set expiry/renewal rule → Confirm → Update entity subscription state.

Custom quote/discount flow → Distributor requests special pricing for a school → Super Admin reviews → Approves requested discount → Creates custom quote/coupon → Selects school → Defines discount percentage or fixed amount → Defines validity → Defines discount-sharing ratio between distributor and platform → Save → Apply approved discount to invoices → System calculates final customer amount and settlement amounts automatically.

22. Module and Feature Management

Modules & Features → Show complete module/feature catalogue → Select School or Distributor → Select modules/features → Enable or Disable → Configure allowed settings → Save → Update tenant entitlements → Record audit event.

Example flow → Distributor requests Exam Module only for School A → Super Admin opens Modules & Features → Select School A → Enable Exam Module → Disable non-required modules → Apply configured pricing from Pricing section or approved custom amount → Save → School receives only the configured module access.

Pricing defines cost; Module Management defines entitlement and access. Keep these concepts separate but connected.

23. Audit and Security

Audit Log → Record every sensitive Super Admin action → Include actor, action, target entity, timestamp, previous value where applicable, new value, related invoice/transaction/reference, and session/IP information where already supported by the system.

Audit events should include school creation, distributor creation, account status changes, login-as-school, module changes, subscription changes, pricing changes, SMS credit changes, payment recording, invoice creation/update/cancellation, financial adjustment, agreement updates, agent approval, certification approval, cluster assignment, and configuration changes.

24. Global Search and Cross-Information Journey

Global Search → Search School, Distributor, Agent, Government Official, Agreement, Invoice, Payment, Activation Link, Cluster, and related transaction identifiers → Show entity type, name/identifier, status, and related entity → Open the relevant profile or record.

Cross-information navigation must remain available throughout the system. School Invoice → View Distributor. Distributor Transaction → View related School. Distributor Commission → View source School Payments. Payment → View Invoice. Invoice → View Payment History. Settlement → View Distributor and underlying School transactions. Agreement → View assigned entity. Activation Link → View associated School.

25. Standard User Journey Pattern

Super Admin Login → Dashboard → Select management area → Search/List → Select Entity → Open consolidated profile → Review summary → Select contextual section → Perform action → Validate/Confirm → Update source record → Refresh related profile data → Create audit event → Return to profile/list.

26. School Journey

Super Admin → Schools → Search/Create School → Manage → School Profile → Overview → School Information → Subscription & Modules → Financials → SMS → Activation Links → Agreements → Distributor → Activity Log → Perform required action → Save → Audit Log.

27. Distributor Journey

Super Admin → Distributors → Search/Create Distributor → Manage → Distributor Profile → Overview → Schools → Agents → Cluster/Territory → Agreements → Financials → Invoices/Transactions → Activity Log → Perform required action → Save → Audit Log.

28. Financial Journey

School monthly billing cycle → Calculate subscription/module charges → Apply discount → Add additional fees → Calculate platform fee → Calculate distributor commission → Determine net payable → Super Admin reviews → Create Invoice → Invoice Issued → School Owner receives School-facing invoice → School Owner pays → Super Admin records payment → Invoice Paid or Partially Paid → Receipt generated → Distributor commission/settlement updated → Distributor sees relevant financial portion → Super Admin retains full financial record → Settlement becomes Pending/Paid/Reconciled → All events remain in the timeline and audit history.

29. Financial Data Principle

One transaction record → Multiple role-specific views. One invoice → Complete Super Admin view → School-specific view → Distributor-specific view. One payment → Linked to invoice → Linked to school → Linked to distributor where applicable → Reflected in commission and settlement calculation. One financial timeline → Different visibility according to role.

The centralized Financial Management section is the authoritative ledger. School and Distributor profiles must expose the relevant records from the same source. No duplicated or conflicting financial data should exist between profiles and the central ledger.

30. UI and Coding Requirements

Do not destroy or replace the available website UI frame. Do not introduce a completely new visual system. Preserve the current navigation shell, page layout, card style, table style, form style, typography, spacing, button hierarchy, responsive behavior, and existing reusable components. Reorganize content inside the existing frame using tabs, sections, drawers, modals, side panels, expandable areas, filters, and timelines where appropriate.

Use the same interaction pattern throughout the product: List → Search/Filter → Manage → Consolidated Profile → Contextual Sections → Action → Confirmation → Updated State → History/Audit. Avoid creating a separate page for information that naturally belongs to the same entity profile.

The School Profile must function as the complete school control center. The Distributor Profile must function as the complete distributor control center. Financial Management must function as the centralized accounting/transaction control center. Agreement Management must function as the centralized document/version control center. Module Management must function as the centralized entitlement control center.

The resulting implementation should feel like a professional ERP-style administration system: centralized source of truth, role-based visibility, traceable financial calculations, controlled permissions, contextual navigation, versioned agreements, immutable transaction history, clear status states, and smooth cross-entity navigation without unnecessary page switching.