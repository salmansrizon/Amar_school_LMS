# Graph Report - .  (2026-07-11)

## Corpus Check
- Large corpus: 2113 files · ~856,919 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1081 nodes · 2304 edges · 91 communities (60 shown, 31 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.82)
- Token cost: 1,496,429 input · 264,073 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Student Lifecycle (AdmissionArchiveTransfer)|Student Lifecycle (Admission/Archive/Transfer)]]
- [[_COMMUNITY_Attendance & Employees Core|Attendance & Employees Core]]
- [[_COMMUNITY_Print Templates & Admission Docs|Print Templates & Admission Docs]]
- [[_COMMUNITY_School-Owner UI Mockup Spec|School-Owner UI Mockup Spec]]
- [[_COMMUNITY_Behaviour Log Schema & RLS|Behaviour Log Schema & RLS]]
- [[_COMMUNITY_Root Layout & Auth Shell|Root Layout & Auth Shell]]
- [[_COMMUNITY_Role-Based Routing|Role-Based Routing]]
- [[_COMMUNITY_Super-Admin Partners & Locations|Super-Admin Partners & Locations]]
- [[_COMMUNITY_Foundation Multi-Tenant Schema|Foundation Multi-Tenant Schema]]
- [[_COMMUNITY_Role-Specific Dashboard Pages|Role-Specific Dashboard Pages]]
- [[_COMMUNITY_Super-Admin Ops Pages|Super-Admin Ops Pages]]
- [[_COMMUNITY_Class & Curriculum Actions|Class & Curriculum Actions]]
- [[_COMMUNITY_Web Package Dependencies|Web Package Dependencies]]
- [[_COMMUNITY_Subscription Code Actions|Subscription Code Actions]]
- [[_COMMUNITY_AbsenceReconcile Cron Routes|Absence/Reconcile Cron Routes]]
- [[_COMMUNITY_TypeScript Compiler Config|TypeScript Compiler Config]]
- [[_COMMUNITY_PRD Module Index|PRD Module Index]]
- [[_COMMUNITY_Architecture Doc Sections|Architecture Doc Sections]]
- [[_COMMUNITY_Grace Window & Attendance Status|Grace Window & Attendance Status]]
- [[_COMMUNITY_RFID Attendance Schema|RFID Attendance Schema]]
- [[_COMMUNITY_Domain Glossary (CONTEXT.md)|Domain Glossary (CONTEXT.md)]]
- [[_COMMUNITY_Core Entities Concept Set|Core Entities Concept Set]]
- [[_COMMUNITY_Fee Receipt & Amount-in-Words|Fee Receipt & Amount-in-Words]]
- [[_COMMUNITY_Class Curriculum Concepts|Class Curriculum Concepts]]
- [[_COMMUNITY_Subscription Codes Schema|Subscription Codes Schema]]
- [[_COMMUNITY_Locations & Clusters Schema|Locations & Clusters Schema]]
- [[_COMMUNITY_Role Definitions (ADR 0003)|Role Definitions (ADR 0003)]]
- [[_COMMUNITY_Territory Assignments Schema|Territory Assignments Schema]]
- [[_COMMUNITY_Exam Closed-State Schema|Exam Closed-State Schema]]
- [[_COMMUNITY_Syllabus UploadStorage|Syllabus Upload/Storage]]
- [[_COMMUNITY_Subscription Codes Integration Tests|Subscription Codes Integration Tests]]
- [[_COMMUNITY_RFIDHardware Ingest Rationale|RFID/Hardware Ingest Rationale]]
- [[_COMMUNITY_Absence SMS Integration Tests|Absence SMS Integration Tests]]
- [[_COMMUNITY_Employee Grace Concepts|Employee Grace Concepts]]
- [[_COMMUNITY_TerritoryLocations Concepts|Territory/Locations Concepts]]
- [[_COMMUNITY_RFIDGrace Concepts|RFID/Grace Concepts]]
- [[_COMMUNITY_Staff Permissions Schema|Staff Permissions Schema]]
- [[_COMMUNITY_Design System & Bilingual ADRs|Design System & Bilingual ADRs]]
- [[_COMMUNITY_Class Routine & Transfer Concepts|Class Routine & Transfer Concepts]]
- [[_COMMUNITY_Subscription Concepts|Subscription Concepts]]
- [[_COMMUNITY_Territory Assignments Tests|Territory Assignments Tests]]
- [[_COMMUNITY_Multi-Tenancy & Print ADRs|Multi-Tenancy & Print ADRs]]
- [[_COMMUNITY_RLS & Staff Permissions Tests|RLS & Staff Permissions Tests]]
- [[_COMMUNITY_Supabase Linked-Project Temp Config|Supabase Linked-Project Temp Config]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 133 edges
2. `currentLang()` - 61 edges
3. `createClient()` - 48 edges
4. `Lang` - 41 edges
5. `UI Mockup Design Spec (DESIGN-SPEC.md)` - 31 edges
6. `Amar School Management — Web Rebuild PRD` - 28 edges
7. `applyLang() / window.setLang` - 21 edges
8. `applyTheme() / window.setTheme` - 20 edges
9. `requireSchoolMember()` - 19 edges
10. `CONTEXT.md — Canonical Glossary` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Attendance Job Monitor Page` --semantically_similar_to--> `/api/attendance/reconcile route handler (daily cron)`  [INFERRED] [semantically similar]
  ui/super-admin/attendance-job-monitor.html → web/app/api/attendance/reconcile/route.ts
- `Figma mockup: Design System style reference sheet` --semantically_similar_to--> `Family Design System (standalone Figma community bundle export)`  [INFERRED] [semantically similar]
  figma/00-design-system.svg → Design System/Family Design System (standalone)-2.html
- `Vendor SMS Compose Page` --semantically_similar_to--> `/api/sms/absence route handler (daily cron)`  [INFERRED] [semantically similar]
  ui/super-admin/vendor-sms-compose.html → web/app/api/sms/absence/route.ts
- `proxy()` --conceptually_related_to--> `Schools List Page`  [INFERRED]
  web/proxy.ts → ui/super-admin/schools-list.html
- `ADR 0006: Tailwind for the production app, not the mockups' design-system.css` --conceptually_related_to--> `Figma mockup: Design System style reference sheet`  [INFERRED]
  docs/adr/0006-tailwind-over-shared-design-system-css.md → figma/00-design-system.svg

## Hyperedges (group relationships)
- **Territory assignment model (list-of-assignments, per-assignment tier, Extended-access flag)** — context_territory, context_dealer, context_government_official, docs_prd_territory_location_management, figma_04_super_admin_dealer_territory [EXTRACTED 1.00]
- **One login page, role determines routing/rendering** — adr_0003_unified_app_role_based_access, docs_architecture_application_shape, figma_01_login, ui_index, docs_prd_roles_table [EXTRACTED 1.00]
- **Shared print-template layer across every printable module** — adr_0007_browser_print_over_server_pdf, docs_architecture_hardware_integrations, docs_prd_exams_results, docs_prd_accounting_fees [INFERRED 0.85]
- **School-owner pages instantiating the shared app-shell markup pattern defined in DESIGN-SPEC.md** — ui_design_spec_shell_markup_pattern, school_owner_classes_list_page, school_owner_sms_compose_page, school_owner_fee_structures_page [EXTRACTED 1.00]
- **Extended-access carve-out demonstrated across Dealer and Government Official vendor-product dashboards** — ui_design_spec_extended_access_pattern, dealer_dashboard_page, gov_official_dashboard_page, gov_official_performance_reports_page [INFERRED 0.85]
- **Closed-exam-is-permanent rule demonstrated in both the School Owner's own exams list and the Government Official's read-only drilldown** — ui_design_spec_closed_exam_permanent_rule, school_owner_exams_list_page, gov_official_school_drilldown_page [INFERRED 0.85]
- **Grace Window Max-Resolution Across Employee Pages** — school_owner_employee_detail, school_owner_employee_create_form, school_owner_attendance_employee, school_owner_grace_window_max_rule [INFERRED 0.85]
- **RFID Tap Entry/Exit Reconciliation Flow** — school_owner_attendance_student_mark, school_owner_attendance_employee, school_owner_rfid_card_assignment, school_owner_rfid_tap_reconciliation_rule [INFERRED 0.85]
- **Accounting & Fees Module Tab Group** — school_owner_general_ledger, school_owner_bank_cash_accounts, school_owner_asset_register, school_owner_fee_collection [EXTRACTED 1.00]
- **Staff permission grant -> staff dashboard gating -> permission-denied fallback** — school_owner_staff_permissions, staff_user_dashboard, staff_user_permission_denied [INFERRED 0.85]
- **Exam setup -> seat plan -> exam routine -> marks entry -> mark sheet preview** — school_owner_exam_setup, school_owner_seat_plan, school_owner_exam_routine, school_owner_marks_entry, school_owner_mark_sheet_preview [INFERRED 0.85]
- **Seat plan and class routine builder both gate Publish on conflict resolution** — school_owner_seat_plan, school_owner_class_routine_builder, concept_publish_blocked_by_conflict [INFERRED 0.85]
- **Territory Assignment Pattern (Dealer & Gov Official)** — super_admin_dealer_detail_territoryassignment, super_admin_dealer_detail_page, super_admin_gov_official_detail_page, super_admin_locations_tree_locationhierarchy, super_admin_dealer_detail_tierpolicy [INFERRED 0.85]
- **RFID Card-to-Attendance Pipeline** — super_admin_binding_code_inventory_page, super_admin_attendance_job_monitor_page, super_admin_school_detail_admin_page, reconcile_route_handler [INFERRED 0.80]
- **Vendor SMS System (Compose + School Flag + Absence Cron)** — super_admin_vendor_sms_compose_page, super_admin_school_detail_admin_page, absence_route_handler [INFERRED 0.75]
- **Role-based post-auth redirect pattern** — app_page_home, callback_route_get, login_page_loginpage, update_page_updatepasswordpage, auth_routing_homefor, auth_post_login_postlogindestination [INFERRED 0.85]
- **Private-bucket signed-URL file access pattern** — student_photo_route_get, syllabus_route_get, auth_require_role_requireschoolmember, issue_27_student_photo, issue_45_class_syllabus [EXTRACTED 1.00]
- **Daily reconcile-then-SMS cron pipeline** — reconcile_route_get, absence_route_get, rpc_reconcile_attendance, rpc_absence_sms_candidates, rpc_record_absence_sms [INFERRED 0.85]
- **Routine slot editing, publishing, and printing flow** — routine_actions_setslot, routine_actions_publishroutine, routine_routine_cell_slotcell, routine_page_routinegrid, print_page_routineprintpage [INFERRED 0.85]
- **'use server' + FormData-shape-validate + RLS-authority + revalidatePath pattern** — classes_actions_addclass, employees_actions_addemployee, exams_actions_addexam, syllabus_actions_recordsyllabus, fees_actions_savefeerecord [INFERRED 0.85]
- **ADR 0007 browser-native print pages composed from shared print pieces** — print_page_routineprintpage, mark_sheet_preview_page_marksheetpreviewpage, print_pieces_printpage, print_print_button_printbutton, adr_0007_browser_native_print [INFERRED 0.85]
- **SMS module off-day/rule/leave CRUD flow** — sms_page_smspage, sms_sms_controls_addoffdayform, sms_actions_addoffday, auth_require_role_requireschoolmember [EXTRACTED 1.00]
- **Staff screen-permission grant flow** — staff_page_staffpage, id_page_staffpermissionspage, id_screen_toggle_screentoggle, staff_actions_setscreengrant [EXTRACTED 1.00]
- **Student printable documents flow (issue #46, ADR 0007)** — id_page_studentdetailpage, admission_page_admissionprintpage, id_card_page_idcardprintpage, adr_0007_browser_native_print [INFERRED 0.85]
- **Super-admin gated server actions (requireSuperAdmin pattern)** — auth_require_role_requiresuperadmin, codes_actions_generatebatch, locations_actions_addlocation, partners_actions_createvendoruser [INFERRED 0.85]
- **Bulk subject assignment flow (class -> students -> student_subjects)** — subject_assignment_page_subjectassignmentpage, subject_assignment_page_assignmentpanel, subject_assignment_bulk_assign_form_bulkassignform, subject_assignment_actions_bulkassignsubjects [EXTRACTED 1.00]
- **Student admission flow (form submit -> admit -> photo upload -> redirect)** — new_page_newadmissionpage, new_admission_form_admissionform, students_actions_admitstudent, new_admission_form_uploadstudentphoto [EXTRACTED 1.00]
- **Bilingual language switching flow (cookie -> server read -> client read -> t())** — lib_i18n_lang_cookie, lib_i18n_server_currentlang, lib_use_lang_uselang, components_lang_switch_langswitch, lib_i18n_t [EXTRACTED 0.95]
- **Printable document template composition (ADR 0007 shared pieces)** — print_pieces_printpage, print_pieces_instituteheader, print_pieces_infogrid, print_pieces_signaturerow, print_pieces_qrfooterrow, print_print_button_printbutton [EXTRACTED 0.90]
- **Role-based access control gating across routing, screens and server actions** — auth_routing_canaccess, auth_routing_homefor, auth_screens_canopenscreen, auth_require_role_requireschoolmember, auth_post_login_postlogindestination [INFERRED 0.80]
- **Multi-tenant School scoping helpers and trigger guards** — migrations_0001_foundation_app_current_school_id, migrations_0012_employees_grace_employee_in_my_school, migrations_0013_grace_hardening_shift_in_my_school, migrations_0028_routine_syllabus_hardening_enforce_routine_slot_school, migrations_0030_student_subjects_enforce_student_subject_school [INFERRED 0.85]
- **Attendance reconciliation function evolution over multi-level grace tables** — migrations_0018_reconcile_keep_unresolved_reconcile_attendance, migrations_0019_reconcile_merge_backfill_reconcile_attendance, migrations_0012_employees_grace_employee_shifts, migrations_0012_employees_grace_shifts, migrations_0012_employees_grace_category_grace_minutes [INFERRED 0.80]
- **Seed scripts bootstrapping test/staging tenants and profiles** — supabase_seed_test_script, supabase_staging_seed_script, migrations_0001_foundation_schools, migrations_0001_foundation_profiles [EXTRACTED 0.90]
- **Cross-tenant FK Tenancy-Guard Trigger Pattern** — migrations_0025_class_routine_enforce_routine_slot_school, migrations_0029_class_tenancy_triggers_enforce_class_ref_school, migrations_0033_student_transfer_tenancy_enforce_student_ref_school [INFERRED 0.90]
- **Private Per-School-Folder Storage Bucket Pattern** — migrations_0026_class_syllabus_storage_class_syllabi, migrations_0026_class_syllabus_storage_school_members_write_own_syllabus_objects, migrations_0032_students_admission_profile_school_members_write_own_student_photos [INFERRED 0.80]
- **Subscription Code Redemption Lifecycle** — migrations_0008_subscription_codes_subscription_codes, migrations_0008_subscription_codes_redeem_code, migrations_0009_code_redemption_permanence_protect_code_redemption [INFERRED 0.80]
- **Same-school tenancy trigger pattern** — concept_routine_slots, concept_student_subjects, concept_student_transfers [INFERRED 0.85]
- **Absence SMS candidate-to-log dispatch pipeline** — migrations_0021_absence_sms_absence_sms_candidates, migrations_0021_absence_sms_record_absence_sms, migrations_0021_absence_sms_sms_log [EXTRACTED 1.00]
- **RFID tap ingest-to-reconciliation flow** — concept_attendance_events, concept_ingest_attendance_events_rpc, concept_reconcile_attendance_rpc, concept_attendance_records [INFERRED 0.85]
- **Behaviour SMS Notification Flow (issue #12)** — lib_students_behavioursmsbody, sms_gateway_smsgateway, sms_gateway_logsmsprovider [INFERRED 0.80]
- **Shared Printable Template Layer (ADR 0007, issue #25)** — print_pieces_printpage, print_pieces_instituteheader, print_pieces_infogrid, print_pieces_gradepanelrow, print_pieces_signaturerow, print_pieces_qrfooterrow [EXTRACTED 1.00]
- **Attendance Reconciliation Rules (issue #10, PRD §5.3)** — lib_attendance_collapsetaps, lib_attendance_employeestatus, concept_prd_5_3 [EXTRACTED 1.00]

## Communities (91 total, 31 thin omitted)

### Community 0 - "Student Lifecycle (Admission/Archive/Transfer)"
Cohesion: 0.05
Nodes (68): StudentsArchivePage(), RestoreButton(), Atomic transfer via single-transaction RPC to avoid orphaned history rows, Issue #27 — Students I, Issue #46 — Students II subject assignment, 3-day behaviour entry lock trigger (migration 0011), PRD §5.1 — subject assignment, AddEntryForm() (+60 more)

### Community 1 - "Attendance & Employees Core"
Cohesion: 0.08
Nodes (54): assignCard(), removeCard(), AssignCardForm(), RemoveCardButton(), AttendancePage(), requireSchoolMember(), addEmployee(), addShift() (+46 more)

### Community 2 - "Print Templates & Admission Docs"
Cohesion: 0.09
Nodes (52): AdmissionPrintPage(), ADR 0007: Browser-native print, ADR 0007 — shared printable template pieces, IdCardPrintPage(), Issue #25 (printable prototype), Issue #27: Students admission profile, Issue #46 (subject assignment), Lang (+44 more)

### Community 3 - "School-Owner UI Mockup Spec"
Cohesion: 0.06
Nodes (66): Publish blocked until scheduling conflict resolved, Absence SMS Daily Batch Evaluation Rule, Section 5.6 Absent-Fine Calculation, Activity Checklist, Asset Register, Attendance Book, Employee Attendance, Mark Student Attendance (+58 more)

### Community 4 - "Behaviour Log Schema & RLS"
Cohesion: 0.05
Nodes (51): Trigger: behaviour_lock, Behaviour Log Entries Table, enforce_behaviour_lock(), Policy: school members manage behaviour log, Policy: school members manage students, student_in_my_school(), Students Table, Policy: super admin manages behaviour log (+43 more)

### Community 5 - "Root Layout & Auth Shell"
Cohesion: 0.1
Nodes (26): hindSiliguri, jakarta, metadata, postLoginDestination(), AuthCard(), LangSwitch(), writeLangCookie(), LogoutButton() (+18 more)

### Community 6 - "Role-Based Routing"
Cohesion: 0.09
Nodes (32): Home(), canAccess(), groupOf(), homeFor(), isProtectedPath(), PROTECTED_GROUPS, Role, ROLE_HOME (+24 more)

### Community 7 - "Super-Admin Partners & Locations"
Cohesion: 0.14
Nodes (28): requireSuperAdmin(), AddAssignmentForm(), RemoveAssignmentButton(), PartnerAssignmentsPage(), buildTree(), childType(), LOCATION_LABEL, LOCATION_LEVELS (+20 more)

### Community 8 - "Foundation Multi-Tenant Schema"
Cohesion: 0.11
Nodes (36): app_current_role() security-definer helper, app_current_school_id() security-definer helper, policy: members read own school, profiles table, register_school() self-service signup function, policy: school owner reads own school profiles, schools table, policy: super admin manages profiles (+28 more)

### Community 9 - "Role-Specific Dashboard Pages"
Cohesion: 0.09
Nodes (35): Purchase Codes Page (dealer/code-purchase.html), Dealer Dashboard Page (dealer/dashboard.html), Government Official Dashboard Page (gov-official/dashboard.html), Performance Reports Page (gov-official/performance-reports.html), Institute Drilldown Page (gov-official/school-drilldown.html), Admit Card Preview Page (school-owner/admit-card-preview.html), Class & Curriculum Page (school-owner/classes-list.html), Director Capital Page (school-owner/director-capital.html) (+27 more)

### Community 10 - "Super-Admin Ops Pages"
Cohesion: 0.11
Nodes (30): /api/sms/absence route handler (daily cron), /api/attendance/reconcile route handler (daily cron), Attendance Job Monitor Page, Binding Code Inventory Page, Cluster (named grouping of Schools within a location node), Clusters Page, Batch Generate Codes Page, Free (Tk 0) subscription code is a normal, valid option (+22 more)

### Community 11 - "Class & Curriculum Actions"
Cohesion: 0.15
Nodes (24): addClass(), addRoom(), addSubject(), ENTITIES, Entity, optStr(), removeItem(), str() (+16 more)

### Community 12 - "Web Package Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, devDependencies, babel-plugin-react-compiler (+18 more)

### Community 13 - "Subscription Code Actions"
Cohesion: 0.16
Nodes (19): decreaseExpiry(), deleteCode(), generateBatch(), redeemCode(), DeleteCodeButton(), GenerateBatchForm(), CodesPage(), decrease_expiry SQL function (issue #6) (+11 more)

### Community 14 - "Absence/Reconcile Cron Routes"
Cohesion: 0.12
Nodes (16): GET(), Architecture §5 — SmsGateway design, Issue #10: reconciliation must be batch, not synchronous, Issue #12: daily absence-SMS job, GET(), Postgres RPC: absence_sms_candidates, Postgres RPC: reconcile_attendance, Postgres RPC: record_absence_sms (+8 more)

### Community 15 - "TypeScript Compiler Config"
Cohesion: 0.1
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 16 - "PRD Module Index"
Cohesion: 0.12
Nodes (19): Data model notes (legacy -> new table mapping), Amar School Management — Web Rebuild PRD, Accounting & Fees (C_ACCOUNTING), Attendance Auto-Processing (PRD §6.9), Central Off-Day / Holiday Template (C_SUPER_DEMO), Class & Curriculum Control (C_CLASS_CONTROL), Dealer Management (PRD §6.3), Employees module (C_EMPLOYEE) (+11 more)

### Community 17 - "Architecture Doc Sections"
Cohesion: 0.12
Nodes (19): Claude Code Local Settings (permissions allowlist), Absence SMS Rule, Amar School Management — Web Rebuild Architecture, Application shape (one Next.js app, role-based route groups), Deployment phasing (Phase 1 prototype free-tier, Phase 2 production), Migration execution (per-School scripted cutover), SmsGateway interface + MimSmsProvider default implementation, Stack (Next.js/Postgres via Supabase/Supabase Auth/Storage/Vercel) (+11 more)

### Community 18 - "Grace Window & Attendance Status"
Cohesion: 0.14
Nodes (13): Issue #10 — attendance reconciliation rules, Issue #9 — Considerable Grace Window, public.effective_grace_minutes (migration 0012), reconcile_attendance (migration 0017), CONTEXT/PRD §5.3 Attendance Reconciliation Rules (issue #10), AttendanceStatus, CollapsedTaps, collapseTaps() (+5 more)

### Community 19 - "RFID Attendance Schema"
Cohesion: 0.15
Nodes (16): Attendance Events Table, Attendance Records Table, ingest_attendance_events() v1, reconcile_attendance() v1, RFID Cards Table, Policy: school members clean events, Policy: school members clean records, Policy: school members manage cards (+8 more)

### Community 20 - "Domain Glossary (CONTEXT.md)"
Cohesion: 0.21
Nodes (14): CONTEXT.md — Canonical Glossary, Behaviour Log Entry, Considerable Grace Window, Exam Closed state, Fee Collection Record, School (tenant), Student / Parent (data subject, not an actor), Subscription Code (+6 more)

### Community 21 - "Core Entities Concept Set"
Cohesion: 0.3
Nodes (14): attendance_records table, fee_collection_records table, Schools table, Students table, Absence SMS Rule test suite, Fee Collection Record test suite, absence_sms_candidates() function, absence_sms_rules table (+6 more)

### Community 22 - "Fee Receipt & Amount-in-Words"
Cohesion: 0.28
Nodes (9): Issue #11 — fee receipt amount-in-words, ReceiptPage(), PrintButton(), belowHundred(), belowThousand(), integerInWords(), ONES, takaInWords() (+1 more)

### Community 23 - "Class Curriculum Concepts"
Cohesion: 0.2
Nodes (12): class_routines table, class_syllabi table, classes table, employees table, rooms table, student_subjects table, subjects table, Class & Curriculum I test suite (+4 more)

### Community 24 - "Subscription Codes Schema"
Cohesion: 0.2
Nodes (9): decrease_expiry() v1, Subscription Codes Table, Policy: super admin deletes unused codes, Policy: super admin inserts codes, Policy: super admin reads codes, Policy: super admin updates codes, Trigger: code_redemption_permanent, decrease_expiry() v2 (+1 more)

### Community 25 - "Locations & Clusters Schema"
Cohesion: 0.24
Nodes (11): Policy: authenticated read clusters, Policy: authenticated read locations, check_location_parent(), Clusters Table, Trigger: location_parent_level, Locations Table, schools_under_location() v1, Policy: super admin manages clusters (+3 more)

### Community 26 - "Role Definitions (ADR 0003)"
Cohesion: 0.33
Nodes (10): ADR 0003: One application, one login, role-based views, Dealer, Government Official, School Owner, Staff User, Super Admin, Auth & roles table (legacy auth -> Supabase Auth mapping), PRD §4 Roles table (+2 more)

### Community 27 - "Territory Assignments Schema"
Cohesion: 0.22
Nodes (7): Policy: assignee reads own assignments, school_reachable_by_me(), Policy: super admin manages assignments, Trigger: territory_assignee_role, Territory Assignments Table, Policy: territory roles read reachable schools, Unique Territory Assignment Indexes Migration

### Community 28 - "Exam Closed-State Schema"
Cohesion: 0.28
Nodes (8): enforce_exam_close() v1, Trigger: exam_close_immutable, Exams Table, Policy: school members manage exams, Policy: super admin manages exams, enforce_exam_close() v2, Trigger: exam_touch, touch_exam()

### Community 29 - "Syllabus Upload/Storage"
Cohesion: 0.57
Nodes (6): deleteSyllabus(), ownPath(), pathFor(), recordSyllabus(), syllabusUploadPath(), SyllabusRow()

### Community 30 - "Subscription Codes Integration Tests"
Cohesion: 0.25
Nodes (3): codes, generatedCodes, [used, unused]

### Community 31 - "RFID/Hardware Ingest Rationale"
Cohesion: 0.38
Nodes (7): ADR 0001: Dual-path ingest for attendance-machine sync, Attendance Event, Background jobs (attendance_events reconciliation job), Hardware & external integrations (attendance ingest, RFID, SmsGateway, PDF/printing), Attendance module (C_ATTENDANCE, C_CARD), SMS module (C_SMS), Handoff: PR 10 / #22 — RFID attendance reconciliation

### Community 32 - "Absence SMS Integration Tests"
Cohesion: 0.38
Nodes (5): anon(), candidates(), DAYS, record(), rows

### Community 33 - "Employee Grace Concepts"
Cohesion: 0.29
Nodes (7): category_grace_minutes table, effective_grace_for_my_school() RPC, effective_grace_minutes() RPC, employee_shifts table, my_territory_schools() RPC, set_school_default_grace() RPC, Employee + Grace Window test suite

### Community 34 - "Territory/Locations Concepts"
Cohesion: 0.29
Nodes (7): Clusters table, create_vendor_user() RPC, Locations table (hierarchy), schools_under_location() RPC, territory_assignments table, Territory & Location hierarchy test suite, Dealer/Gov Official Territory assignment test suite

### Community 35 - "RFID/Grace Concepts"
Cohesion: 0.29
Nodes (7): attendance_events table, web/lib/grace.ts (effectiveGrace), ingest_attendance_events() RPC, reconcile_attendance() RPC, rfid_cards table, RFID Attendance ingestion + reconciliation test suite, effectiveGrace unit test suite

### Community 36 - "Staff Permissions Schema"
Cohesion: 0.38
Nodes (7): Policy: owner grants, owner_manages_staff(), Policy: owner reads own school grants, Policy: owner revokes, Staff Permissions Table, Policy: staff read own grants, Policy: super admin manages grants

### Community 37 - "Design System & Bilingual ADRs"
Cohesion: 0.47
Nodes (6): ADR 0004: Bangla-primary bilingual UI, not legacy's English-only chrome, ADR 0006: Tailwind for the production app, not the mockups' design-system.css, Family Design System (standalone Figma community bundle export), Bilingual UI cross-cutting requirement (PRD §7), Figma mockup: Design System style reference sheet, Figma-importable mockups README

### Community 38 - "Class Routine & Transfer Concepts"
Cohesion: 0.33
Nodes (6): assign_student_roll trigger, routine_slots table, shifts table, student_transfers table, transfer_student() RPC, Students I admission/roll/transfer test suite

### Community 39 - "Subscription Concepts"
Cohesion: 0.33
Nodes (6): decrease_expiry() RPC, generate_code_batch() RPC, redeem_code() RPC, school_subscription_status() RPC, subscription_codes table, Subscription Codes + manual expiry test suite

### Community 40 - "Territory Assignments Tests"
Cohesion: 0.33
Nodes (3): rows, schoolA, schoolB

### Community 41 - "Multi-Tenancy & Print ADRs"
Cohesion: 0.4
Nodes (5): ADR 0002: Shared database, shared schema, tenant_id-scoped multi-tenancy, ADR 0007: Browser-native print, no server-side PDF renderer, Permission Grant, Multi-tenancy (school_id + RLS, staff_permissions, territory_assignments), Staff Permissions (C_USER_CONTROL)

### Community 43 - "RLS & Staff Permissions Tests"
Cohesion: 0.4
Nodes (5): create_staff_user() RPC, profiles table, staff_permissions table, Cross-school RLS boundary test suite, Staff Permission Grant test suite

### Community 44 - "Supabase Linked-Project Temp Config"
Cohesion: 0.4
Nodes (4): name, organization_id, organization_slug, ref

### Community 45 - "Community 45"
Cohesion: 0.5
Nodes (4): close_exam() RPC, Exams table, Exam entity + Closed state test suite, Mark-sheet preview data test suite

### Community 46 - "Community 46"
Cohesion: 0.5
Nodes (3): ADR 0001: Dual-path attendance ingest, Postgres RPC: ingest_attendance_events, POST()

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (3): orgId, projectId, projectName

## Ambiguous Edges - Review These
- `archiveStudent()` → `PRD §5.1: Printable admission/ID templates & Old Students soft-archive`  [AMBIGUOUS]
  web/app/school/students/actions.ts · relation: references
- `Dealer Dashboard Page (dealer/dashboard.html)` → `Admit Card Preview Page (school-owner/admit-card-preview.html)`  [AMBIGUOUS]
  ui/dealer/dashboard.html · relation: shares_data_with
- `Class/Shift Transfer Modal Page (school-owner/student-transfer-modal.html)` → `Result Book Page (school-owner/result-book.html)`  [AMBIGUOUS]
  ui/school-owner/student-transfer-modal.html · relation: shares_data_with
- `Institute Profile Page (school-owner/institute-profile.html)` → `Admit Card Preview Page (school-owner/admit-card-preview.html)`  [AMBIGUOUS]
  ui/school-owner/institute-profile.html · relation: shares_data_with

## Knowledge Gaps
- **292 isolated node(s):** `crons`, `name`, `version`, `private`, `dev` (+287 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `archiveStudent()` and `PRD §5.1: Printable admission/ID templates & Old Students soft-archive`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Dealer Dashboard Page (dealer/dashboard.html)` and `Admit Card Preview Page (school-owner/admit-card-preview.html)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Class/Shift Transfer Modal Page (school-owner/student-transfer-modal.html)` and `Result Book Page (school-owner/result-book.html)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Institute Profile Page (school-owner/institute-profile.html)` and `Admit Card Preview Page (school-owner/admit-card-preview.html)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **Why does `t()` connect `Attendance & Employees Core` to `Student Lifecycle (Admission/Archive/Transfer)`, `Print Templates & Admission Docs`, `Root Layout & Auth Shell`, `Role-Based Routing`, `Super-Admin Partners & Locations`, `Class & Curriculum Actions`, `Subscription Code Actions`, `Fee Receipt & Amount-in-Words`, `Syllabus Upload/Storage`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `proxy()` connect `Role-Based Routing` to `Super-Admin Ops Pages`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Attendance & Employees Core` to `Student Lifecycle (Admission/Archive/Transfer)`, `Print Templates & Admission Docs`, `Root Layout & Auth Shell`, `Role-Based Routing`, `Super-Admin Partners & Locations`, `Class & Curriculum Actions`, `Subscription Code Actions`, `Fee Receipt & Amount-in-Words`, `Syllabus Upload/Storage`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._