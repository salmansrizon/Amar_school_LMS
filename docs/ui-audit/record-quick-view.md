# Record Quick View UX Pattern

## Decision

Use **Record Quick View** as the cross-feature list interaction standard.

A row/card click opens a summary drawer instead of forcing an immediate page transition. Edit behavior depends on module risk.

## First implementation scope

Use the grid and spacing rules from [`design-grid-system.md`](./design-grid-system.md) and the motion rules from [`motion-status-animation.md`](./motion-status-animation.md). The drawer/sheet must visually follow `Design System/new ui/` People references.

Implement first for **People records**:

- Students
- Employees

## People record behavior

### Desktop

1. User clicks a Student or Employee row/card.
2. A right-side drawer opens over the current list.
3. The list remains visible behind the drawer so the user keeps context.
4. The drawer defaults to profile/read mode.
5. An edit icon is visible only to users with permission to edit that record.
6. Clicking edit switches the drawer to full edit mode.
7. Save refreshes the record and returns to profile mode.
8. Cancel discards local changes and returns to profile mode.
9. Drawer open/close uses a subtle slide/fade; save uses a short success highlight; pending corrections/unread notes may use a restrained pulse dot.

### Mobile

Use the same interaction as a full-screen sheet:

- 16px gutters.
- Touch targets at least 44px high.
- Sticky header with close/back and save/cancel actions.
- Avoid cramped tables inside the sheet.

## Detail route behavior

Do **not** remove detail routes. Keep routes such as:

- `/school/students/[id]`
- `/school/employees/[id]`

But redesign them to render the same Profile/Edit UI model used by the drawer. This preserves:

- Direct URLs.
- Browser refresh.
- Search result links.
- Permission boundaries.
- Print routes.
- Transfer/archive/login/advanced actions.
- Existing tests that navigate directly.

## Student drawer content

Profile mode should prioritize:

- Name, photo, roll/id, class offering, section, shift, academic year.
- Guardian/contact information.
- Attendance/fee/result status summaries where available.
- Recent warnings or pending corrections.
- Advanced actions: print admission, print ID card, transfer, archive, login management, subject assignment.

Edit mode should support the full editable student form inside the drawer/sheet.

## Employee drawer content

Profile mode should prioritize:

- Name, photo, role/category/designation.
- Contact information.
- Shift/office-time/office-hour context where relevant.
- Attendance summary where relevant.
- Advanced actions: archive, permissions/staff login where applicable.

Edit mode should support the full editable employee form inside the drawer/sheet.

## Cross-feature extension

Record Quick View should be used across all modules as a consistent list pattern, but editing must respect workflow risk.

| Feature area | Quick View behavior | Edit behavior |
| --- | --- | --- |
| Students | Profile drawer | Full edit in drawer first implementation |
| Employees | Profile drawer | Full edit in drawer first implementation |
| Class Offerings | Class summary drawer | Edit guarded by class usage/archive rules |
| Fee Collection Records | Receipt/status summary drawer | Safer correction/review flow, not casual inline edit |
| Exams | Exam setup/result summary drawer | Step-based edit screens for setup, marks, promotion |
| SMS | Campaign/log summary drawer | Compose/send remains explicit action with credit confirmation |
| Notices | Notice summary drawer | Edit/publish flow with audience review |
| Staff Permissions | Staff access summary drawer | Explicit permission matrix with save/review state |
| Super Admin Schools/Distributors/Agents | Account/profile summary drawer | Edit depends on account lifecycle/KYC/status risk |
| Agreements/Settlements | Summary drawer | High-risk actions require confirmation and audit trail |

## Design references

- Grid system: [`design-grid-system.md`](./design-grid-system.md)
- Motion/status animation: [`motion-status-animation.md`](./motion-status-animation.md)
- People directory: [`student-directory-desktop.png`](../../Design%20System/new%20ui/02-people/student-directory-desktop.png)
- Student admission: [`student-admission-desktop.png`](../../Design%20System/new%20ui/02-people/student-admission-desktop.png)
- Employee directory: [`employees-directory-desktop.png`](../../Design%20System/new%20ui/02-people/employees-directory-desktop.png)
- People journey sequence: [`people-01-entry-desktop.png`](../../Design%20System/new%20ui/07-screen-sequences/people-01-entry-desktop.png)

## Non-goals

- Do not remove existing routes during the first implementation.
- Do not make high-risk financial, exam, settlement, SMS, or permission actions fully inline just for consistency.
- Do not bypass authorization; drawer actions must use the same grants and server checks as current routes.
- Do not replace print pages with drawer content. Print remains browser-native print through dedicated print views or scoped print surfaces.
