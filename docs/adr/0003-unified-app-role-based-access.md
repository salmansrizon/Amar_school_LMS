---
status: accepted
---

# One application, one login, role-based views — not separate apps

The legacy system ships as three entirely separate desktop applications/logins: AmarSchoolManagement for Schools (School Owner/Staff User) and SuperAdminSchoolManagement for the vendor's Super Admin, Dealers (record-only, no real login today), and Government Officials, each with its own login screen and installer. For the web rebuild we're merging these into a single Next.js application with one login page; what a user sees and can do after logging in is determined entirely by their role (School Owner, Staff User, Dealer, Super Admin, Government Official). We chose this over keeping separate frontends (e.g. app.* vs partners.*) because all audiences now share one backend/database by design (ADR 0002) and the user explicitly wants one shared login experience rather than the legacy split. The trade-off accepted: School, Dealer, and Super Admin release cycles are now coupled, and route-level access control must be enforced carefully per role since they live in the same app.
