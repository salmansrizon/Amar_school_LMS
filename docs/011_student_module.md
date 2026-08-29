Update Class & Section Selection Across Attendance and Students Modules
Please inspect the existing implementation of the Attendance module and reuse the existing class/section dropdown pattern already implemented elsewhere in the application.
Objective
Currently, in the Mark Attendance tab, users first select a Class and then select a Section from a separate dropdown.
I want to simplify this experience by removing the separate Section dropdown entirely.
Instead, the Class dropdown itself should display every available class + section combination as a single selectable item.
For example:
Select class
Seven - Morning - A
Nine - Morning - A
Nine - Day - B
Six - Morning - A
Ten - Day - C
Eight - Day - A

The attached screenshot shows the exact type of UI/behavior expected.
Important: Reuse Existing Implementation
Do not create a new custom dropdown implementation if an existing reusable component/logic is already available.
A similar class/section selector is already being used in:
Exams → Basic Info
Exams → Exam Setup
/school/fees
Please inspect those implementations and reuse the same component, data structure, filtering logic, styling, and behavior wherever practical.
The goal is to keep the UI and behavior consistent throughout the application.
Required Changes
1. Attendance → Mark Attendance
Replace the current:
Class dropdown
+
Section dropdown

with a single:
Class + Section dropdown

Each option should represent one available class/section combination.
Example:
Seven - Morning - A
Nine - Morning - A
Nine - Day - B
Six - Morning - A
Ten - Day - C
Eight - Day - A

Selecting an item should internally provide both the class and section required by the existing attendance functionality.
All existing attendance filtering and behavior should continue to work exactly as before.

2. Attendance → Attendance Book
Apply the same unified Class + Section dropdown here.
Remove the separate Section selection if it exists.
The selected option must correctly filter the Attendance Book using both the selected class and section.

3. Attendance → Student Logs
Apply the same unified Class + Section dropdown here as well.
Remove the separate Section dropdown and ensure the selected class/section combination is correctly applied to the existing Student Logs filtering logic.

4. Students → Students List
Apply the same unified Class + Section dropdown to the Students List.
Users should be able to select a specific class/section combination directly from one dropdown.
The existing Students List filtering behavior must remain intact.
Functional Requirements
Show only available class/section combinations.
Each dropdown option must clearly display both class and section information.
Do not duplicate identical class/section combinations.
Selecting an option must preserve the underlying class ID and section ID/value required by the existing APIs and filtering logic.
Preserve all existing filtering behavior, API requests, pagination, state management, and empty-state handling.
Do not introduce unnecessary changes to unrelated functionality.
Keep the implementation consistent with the existing architecture and coding conventions.
UI/UX Requirements
The dropdown should follow the existing application's design system.
Use the same:
Dropdown component
Typography
Spacing
Border/radius
Focus/selected states
Placeholder behavior
Option rendering
Search behavior, if the existing reusable component supports it
The result should feel like the same component already used in Exams and Fees, not a newly designed component.
Implementation Approach
Before making changes:
Inspect the existing Exams → Basic Info implementation.
Inspect Exams → Exam Setup.
Inspect /school/fees.
Identify the existing reusable class + section selector and its data/model structure.
Identify how Attendance currently maps class and section selections to API/filter parameters.
Reuse the existing implementation wherever possible rather than duplicating logic.
Then update:
Attendance → Mark Attendance
Attendance → Attendance Book
Attendance → Student Logs
Students → Students List
Regression Safety
Do not change the underlying business logic unnecessarily.
The main change is UI/selection consolidation:
Before
Class → Select Class
Section → Select Section

After
Class → Select Class + Section

The selected combined option must still produce the same class and section values expected by the existing backend and filtering logic.
Finally, verify all four locations to ensure:
The dropdown loads correctly.
Available class/section combinations are correct.
Selection works correctly.
Filtering returns the expected students/attendance records.
Switching between selections works correctly.
No existing functionality is broken.
No duplicate or unnecessary components/logic are introduced.
