Please implement a Student Attendance Log feature inside the existing /school/attendance module.
First inspect the existing attendance code, database structure, UI patterns, authorization/multi-tenant logic, i18n, and existing printing system. Reuse existing logic and components wherever possible. Do not break or redesign existing attendance features. Do not over-engineer.
Requirements:
Add a dedicated attendance tab such as Student Log.
Allow School Admin to select Class → Section.
Load students of that class/section, sorted properly by roll number.
Each student should have a View Log button.
Student log should show that student's attendance history.
Default view: current month / last ~30 days, whichever fits the existing attendance system best.
Filters:
Today
Monthly
Custom From Date → To Date
Reuse the existing attendance status logic for Present, Absent, Leave, Holiday/Off Day, etc. Do not duplicate business logic.
Show basic student information: Name, Roll, Class, Section.
Add Print for the currently filtered attendance data.
For printing, follow the project's existing print architecture and make the result professional and A4-ready. The print header must use configured institution information such as:
Institution Name, Address, Mobile, Email, EIIN, Logo and other available institution details.
Printing must support:
clean professional layout
high-resolution/browser print quality
A4
automatic multi-page pagination
proper borders/spacing/typography
no broken/clipped rows
no buttons, filters or navigation in print
layout integrity on commercial printers
If shared print components already exist, improve/reuse them rather than creating another print system.
Also ensure:
Existing Attendance Mark, Attendance Book, Leave, Off Days, etc. continue working.
Tenant/school isolation is strictly preserved.
Existing UI/design, responsive behavior and dark mode are respected.
Existing Bangla/English i18n conventions are followed.
No unnecessary database tables, libraries, state management or refactors are introduced.
Work chunk by chunk if necessary: inspect → student finder → individual log → filters → print → tests.
Before coding, briefly tell me what existing components/logic you will reuse and which files you expect to modify. Then implement it completely and run relevant tests.
At the end, report:
What was implemented
Important files changed
Tests performed
Any real remaining issue
Think professionally and make the smallest clean production-ready change that fits the existing LMS.