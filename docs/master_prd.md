# Master Development Context

## Platform Overview

Amar School ERP is an enterprise-grade, cloud-native, multi-tenant School Management SaaS platform designed to serve educational institutions through a centralized software platform while scaling its business through a partner-driven distribution ecosystem. The platform is no longer a traditional School ERP but a configurable SaaS product that separates business logic from platform capabilities. The existing application already contains mature modules such as Student Management, Teacher Management, Employee Management, Attendance, Examination, Fee Collection, Accounting, Library, Inventory, SMS, Dashboard, Reports, and Notifications. These modules should be considered stable and production-ready. Future development must extend the current architecture rather than replacing or redesigning existing functionality.

The platform follows a modular architecture based on Clean Architecture principles, Domain Driven Design (DDD), Repository Pattern, Dependency Injection, Event-Driven communication, and Configuration-Driven business rules. Every new feature should integrate with the current architecture while maintaining backward compatibility. Existing database tables, APIs, and user interfaces should only be modified where extension is required. Any new functionality must be implemented as an additive capability instead of replacing existing modules.

---

## Product Vision

The long-term vision of Amar School ERP is to become the leading configurable School ERP SaaS platform in Bangladesh and eventually expand internationally through a distributor and partner network. The company owns the software, infrastructure, hosting, payment gateway, SMS gateway, subscription system, and licensing platform. Distributors are responsible for business expansion, customer acquisition, implementation, onboarding, training, and first-level support. Agents operate under distributors and perform field-level sales, implementation, customer visits, and training. Schools subscribe directly to the company, while distributors receive configurable revenue sharing based on subscription plans, implementation services, SMS sales, and other commercial activities.

The product philosophy is to prioritize market expansion during the first three years instead of maximizing immediate profit. Revenue-sharing models are intentionally designed to favor distributors during the early years to encourage aggressive sales and market penetration. As customer retention improves and subscriptions renew, the company gradually increases its revenue share while maintaining distributor profitability.

---

## Development Philosophy

The platform should be built as a configurable business platform rather than a collection of hardcoded modules. Every configurable business rule must be managed by the Super Admin through administration screens instead of source code modifications. Pricing, commissions, subscription plans, module availability, feature access, user permissions, SMS pricing, approval workflows, settlement rules, and partner incentives should all be configurable. Developers should avoid implementing business logic directly inside controllers or frontend components. Business rules must reside inside domain services and reusable platform engines.

The primary architectural objective is to reduce future development effort by creating reusable engines instead of isolated features. For example, distributor approval should not be implemented as a standalone feature; instead, a generic Workflow Engine should be developed that can later support school approval, leave approval, SMS purchase approval, discount approval, and any future approval process. Similarly, instead of implementing individual permission checks inside each module, the application should rely on a centralized Policy Engine responsible for authorization and access control.

---

## Super Admin Philosophy

The Super Admin represents the platform owner and has complete authority over every business function. All platform configuration originates from the Super Admin. This role is responsible for managing distributors, agents, schools, users, subscription plans, pricing, student-based billing, feature flags, licensing, commissions, settlements, workflows, approval rules, payment gateways, SMS providers, SMS inventory, notifications, reports, dashboards, audit logs, and system policies.

The Super Admin can enable or disable modules globally or for individual schools. Each school can have different feature availability based on subscription plans. Module access, sub-module access, menu visibility, API permissions, and role permissions should all be configurable from the administration panel. No lower-level user should be able to override platform policies.

for details you can check `docs\001_super_admin.md`

---

## Partner Ecosystem

The platform introduces a hierarchical business ecosystem consisting of Company, Distributor, Agent, and School. The company owns the software platform and all commercial assets. Distributors act as business partners responsible for expanding the market, onboarding schools, assigning field agents, providing implementation support, training school administrators, maintaining customer relationships, and ensuring customer satisfaction. Agents operate under distributors and perform field activities such as demonstrations, implementation assistance, customer visits, sales, and support.

A distributor cannot become active until the company approves their application and digitally accepts the legal agreement defined by the company. The agreement includes commission rules, territory assignments, confidentiality clauses, renewal terms, payment conditions, support obligations, and termination policies. Every agreement version must be stored for legal compliance along with acceptance timestamp, IP address, user identity, and device information.

Distributors are assigned geographical territories consisting of Country, Division, District, Upazila, or custom business regions. Schools should normally be assigned only within the distributor's territory unless explicitly overridden by the Super Admin.


for details you can check `docs\002_partner_ecosystem.md`

---

## Subscription and Revenue Model

The software follows a recurring subscription model. Every school pays a configurable monthly subscription consisting of a fixed base subscription fee and a variable student-based fee. Initially, the base subscription is approximately 2,000 BDT per month with an additional 7 BDT per active student. After approximately two years, the student-based pricing can increase to 10–15 BDT per student through configuration without modifying application code.

Subscription revenue is automatically shared between the company and distributors according to configurable commission rules. During the first year, distributors receive a larger percentage to encourage aggressive sales. Upon subscription renewal, the distributor's percentage gradually decreases while the company's recurring revenue increases. Commission percentages should never be hardcoded and must remain configurable from the administration panel.

Implementation fees, onboarding charges, training fees, annual licensing, and SMS sales may follow independent commission rules defined by the company.

for details you can check `docs\003_subscription_revenue.md`
---

## SMS Commerce Platform

The SMS module should operate as a centralized commerce platform rather than a simple gateway integration. The company owns the SMS provider account and maintains the only physical SMS balance with external providers. Schools do not purchase SMS directly from providers. Instead, the company allocates virtual SMS balances to individual schools after receiving payment.

Whenever a school sends an SMS, the application sends the message through the centralized company gateway and deducts SMS simultaneously from both the Company Wallet and the School Wallet. Every SMS transaction creates immutable financial and inventory records. Distributor commission is calculated when SMS packages are sold rather than when SMS messages are consumed.

The SMS platform should support masked and non-masked routes, configurable pricing, multiple providers, commission sharing, invoices, payment verification, wallet management, provider reconciliation, and complete audit history.

for details you can check `docs\004_sms_commerce.md`
---

## Financial Platform

All financial operations throughout the application should be managed by a centralized Financial Engine. Individual modules must never implement independent accounting logic. Subscription payments, SMS purchases, implementation charges, commission calculations, settlements, refunds, discounts, wallet adjustments, and partner earnings should all generate standardized ledger entries.

The Financial Engine is responsible for invoices, wallets, commissions, settlements, accounting entries, reconciliation, and financial reporting. Future integrations with external accounting systems should be possible without changing existing business modules.

for details you can check `docs\005_finantial_portal.md`
---

## Policy and Feature Management

Authorization should be managed by a centralized Policy Engine instead of static role checks. Every request should validate authentication, tenant ownership, user role, policy configuration, module availability, feature availability, and business rules before executing application logic.

Feature availability should be controlled by a Feature Engine capable of enabling or disabling modules, sub-modules, menus, APIs, and functionality for individual schools or subscription plans. Every business feature should support trial mode, premium mode, subscription-based activation, or permanent activation through configuration.

for details you can check `docs\006_policy_feature.md`
---

## Workflow and Event Architecture

Business workflows should be generic and reusable. Requests such as distributor onboarding, school approval, SMS purchases, subscription renewals, discount requests, and future approval processes should all execute through a configurable Workflow Engine supporting multiple approval levels, comments, document attachments, notifications, audit logs, and configurable business rules.

Modules should communicate using domain events instead of direct service dependencies whenever possible. Business events such as School Created, Subscription Activated, Invoice Paid, SMS Purchased, Feature Enabled, Agreement Signed, or Commission Settled should publish domain events consumed by Notification Services, Audit Services, Analytics Services, and Reporting modules independently.

for details you can check `docs\007_workflow_event_architeccture.md`
---

## Development Standards

Developers must never duplicate business logic. Existing modules should be extended rather than replaced. All configurable values should be stored in database configuration tables instead of application constants. Domain Services should contain business logic, Repositories should manage data persistence, Controllers should remain thin, and frontend applications should consume backend APIs without embedding business rules.

Every new feature must clearly document its impact on existing modules, APIs, database schema, permissions, workflows, reports, and integrations. Database migrations should be additive and backward compatible. New services should integrate seamlessly into the existing architecture without disrupting current production functionality.

for details you can check `docs\008_development_standards.md`
---

## LLM Development Instructions

When generating code, architecture, documentation, or implementation plans, always assume that the existing Amar School ERP platform already exists and is running in production. Never redesign existing modules unless explicitly instructed. Extend the application using reusable platform engines, configuration-driven business rules, centralized services, and additive database migrations. Prioritize maintainability, scalability, backward compatibility, and enterprise software design principles. Every generated feature must integrate with the existing PRD and architecture while remaining consistent with the platform's long-term vision of becoming a configurable partner-driven SaaS ecosystem.

for details you can check `docs\009_LLM_development.md`