# Amar School Management — Partner Management & Dynamic Policy Extension (PRD v2)

## Objective

Extend the existing multi-tenant School ERP and Vendor Portal with a complete **Partner Management System** that introduces **Distributors**, **Agents**, **centralized governance**, and a **dynamic module configuration engine** without replacing the existing architecture.

The extension preserves the current stack (Next.js, Supabase, PostgreSQL, RLS, role-based routing) and expands the existing Dealer, Territory, Subscription, and Vendor modules.

---

# Business Model

The company remains the platform owner.

* **Company (Super Admin)** owns product, infrastructure, billing, subscriptions, licensing, pricing, commissions, territories, and governance.
* **Distributor** owns regional sales, school acquisition, onboarding coordination, customer relationship, and local business operations.
* **Agent** works under a distributor and performs implementation, training, field visits, and operational support.
* **School Owner** uses the School ERP within the permissions granted by the Super Admin.

All subscription payments are collected centrally by the company.

---

# Governance Model

## Super Admin Authority

Super Admin is the **ultimate authority** and can control every entity in the platform.

Super Admin can manage:

* Distributors
* Agents
* School Owners
* Staff Users
* Government Officials
* Territories
* Schools
* Subscriptions
* Pricing
* Student-based pricing
* Commission rules
* Discount policies
* Feature flags
* Module access
* Sub-module access
* User permissions
* Settlements
* Notifications
* Audit logs

No role can bypass Super Admin restrictions.

---

# Hierarchy

```text
Super Admin
│
├── Distributor
│      ├── Agent
│      └── Assigned Schools
│
├── School Owner
│      └── Staff Users
│
└── Government Official
```

---

# Dynamic Policy & Feature Engine

Replace the existing `school_feature_flags` with a configurable policy engine.

## Configuration Levels

1. Global Configuration
2. Subscription Plan Configuration
3. Distributor Configuration
4. School Configuration
5. Role Configuration
6. User Configuration (optional)

Priority:

```text
User
↓
Role
↓
School
↓
Distributor
↓
Subscription Plan
↓
Global
```

The most specific rule wins unless blocked by a higher-level policy.

---

# School Module Configuration

Super Admin can enable/disable modules for **each individual school**.

Modules:

* Students
* Employees
* Attendance
* Examination
* Fees
* Accounting
* Payroll
* Library
* Hostel
* Transport
* Inventory
* SMS
* Notices
* Gallery
* RFID
* Online Exam
* API
* Mobile App
* AI Features

Example:

School A:

* Attendance: Enabled
* Exam: Enabled
* Payroll: Disabled
* Hostel: Disabled

School B:

* Attendance: Enabled
* Exam: Disabled
* Payroll: Enabled
* Hostel: Enabled

The UI, APIs, menus, and permissions must respect these feature flags.

---

# Role-Based Permission Engine

Permissions are managed only by Super Admin.

Every module supports:

* View
* Create
* Update
* Delete
* Approve
* Export
* Print
* Configure

Example:

Distributor:

* CRM: Full
* Schools: Full
* Agents: Full
* Pricing: None
* Commission Config: None

Agent:

* Assigned Schools: View
* Tasks: Full
* Training: Full
* Finance: None

School Owner:

* School ERP Modules: Configurable
* Partner Management: None

---

# Distributor Module

## Registration

Distributor submits:

* Company Information
* Trade License
* NID
* Contact Person
* Territory Preference
* Bank Details
* Documents

Status:

* Pending
* Under Review
* Approved
* Suspended
* Blocked

---

## Agreement Workflow

A distributor **must accept a legal agreement before activation**.

Workflow:

```text
Registration
→ Verification
→ Agreement Display
→ Accept Terms
→ Super Admin Approval
→ Territory Assignment
→ License Generation
→ Portal Activation
```

The system stores:

* Agreement Version
* Accepted At
* IP Address
* Device Information
* Full Name
* Digital Consent

Login is blocked until the agreement is accepted.

---

## Distributor Dashboard

Sections:

Business KPIs

* Active Schools
* Active Agents
* MRR
* Pending Commission
* Renewals

Sales Pipeline

* Leads
* Demos
* Proposals
* Negotiations

Operations

* Onboarding
* Training
* Support Tickets

Finance

* Wallet
* Commission
* Settlement History

---

# Distributor CRM

Pipeline:

```text
Lead
→ Contact
→ Demo
→ Proposal
→ Negotiation
→ Agreement
→ Implementation Fee
→ Assign Agent
→ Onboarding
→ Go Live
→ Subscription
→ Renewal
```

Each stage stores:

* Owner
* Timestamp
* Notes
* Attachments
* Next Follow-up

---

# School Onboarding

Workflow:

```text
Agreement
→ Payment
→ School Created
→ Agent Assigned
→ Student Import
→ Employee Import
→ Academic Setup
→ Fee Setup
→ Training
→ Verification
→ Go Live
```

Track:

* Progress %
* Assigned Agent
* Due Date
* Completion Date
* Pending Tasks

---

# Agent Module

## Agent Lifecycle

```text
Invitation
→ Registration
→ Verification
→ Certification
→ Approval
→ School Assignment
→ Task Assignment
→ Support Operations
→ Annual Renewal
```

Agent dashboard:

* Assigned Schools
* Today's Tasks
* Open Tickets
* Training Sessions
* Visit Schedule
* Performance Score

---

# Task Management

Task Types:

* Implementation
* Training
* Data Migration
* School Visit
* Hardware Setup
* Support
* Audit

Workflow:

```text
Assigned
→ Accepted
→ In Progress
→ Completed
→ Verified
```

Agents upload:

* Notes
* Photos
* Documents
* Customer Signature

---

# Subscription Model

Monthly Subscription:

```text
Total Fee =
Base Platform Fee
+
(Student Count × Per Student Rate)
```

Initial Pricing:

* Base Fee: BDT 2,000
* Student Rate: BDT 7

After 2 Years:

* Student Rate: BDT 10–15

Student count is calculated from active enrolled students.

---

# Revenue Sharing

Implementation Fee:

* Company: 50%
* Distributor: 50%

Subscription:

Year 1

* Company: 30%
* Distributor: 70%

Year 2

* Company: 50%
* Distributor: 50%

Year 3+

* Company: 70%
* Distributor: 30%

Commission is generated automatically after successful payment.

---

# Commission Engine

Execution:

```text
Invoice Generated
→ Payment Confirmed
→ Calculate Student Count
→ Calculate Subscription
→ Determine Subscription Year
→ Apply Revenue Share
→ Create Commission Ledger
→ Update Distributor Wallet
→ Create Settlement Record
```

No manual calculation is allowed.

---

# Support Workflow

```text
School
→ Ticket
→ Distributor
→ Agent
→ Resolution
→ School Feedback
→ Close
```

Escalation:

Critical issues can be escalated directly to the company.

---

# Database Extensions

New Tables:

* distributors
* distributor_territories
* distributor_agreements
* agents
* agent_assignments
* school_leads
* school_onboarding
* onboarding_tasks
* commissions
* settlements
* partner_wallets
* module_definitions
* submodule_definitions
* school_module_configs
* role_permissions
* feature_policies
* activity_logs

---

# Architecture Extension

Existing services remain.

Add:

```text
Partner Service
├── Distributor Service
├── Agent Service
├── CRM Service
├── Onboarding Service
├── Commission Service
├── Settlement Service
├── Policy Engine
├── Feature Engine
├── Notification Service
└── Audit Service
```

Middleware checks:

1. Authentication
2. Role
3. Territory
4. School
5. Module
6. Sub-module
7. Action Permission

before every route and API.

---

# User Stories

US-PM-001

As Super Admin, I can approve distributors and assign territories.

US-PM-002

As Super Admin, I can enable or disable Attendance, Exam, Fees, Payroll, or any sub-module for a specific school.

US-PM-003

As Super Admin, I can configure module-wise permissions for Distributors, Agents, School Owners, and Staff Users.

US-PM-004

As Distributor, I must accept the distributor agreement before my account is activated.

US-PM-005

As Distributor, I can manage the complete school sales pipeline and onboarding process.

US-PM-006

As Agent, I receive implementation and support tasks for assigned schools.

US-PM-007

As School Owner, I only see the modules enabled for my school.

US-PM-008

As the System, I automatically calculate subscription fees and distributor commissions after payment.

---

# Acceptance Criteria

* Super Admin controls all modules, sub-modules, and permissions.
* School-specific module configuration is enforced in UI and API.
* Distributor account activation requires agreement acceptance and Super Admin approval.
* Student-based pricing is configurable.
* Commission calculation is automatic.
* Territory isolation is enforced.
* Every action is audited.
* Feature changes require no code deployment.
