### Missing Features in the Exam Module

#### 1. Admit Card Printing

Implement a comprehensive *Admit Card Printing* feature.

*Requirements:*

* Allow users to print admit cards for all students under a selected exam.
* Support bulk printing from the student list of the selected exam.
* Allow customization of:

  * Paper color
  * Font color
  * Theme colors (while preserving a professional and consistent appearance)
* Generate high-resolution, print-ready output suitable for commercial printing.
* Display the institution information at the top center of every admit card, including:

  * Institution Name
  * Address (if available)
  * Mobile Number
  * Email Address
  * EIIN (and other configured institution details)
* Include clearly marked blank signature lines for:

  * *Head Teacher*
  * *Class Teacher*
* Maintain a clean, professional, and visually appealing layout.

---

#### 2. Seat Plan Management

Implement a complete *Seat Plan Management* system.

##### A. Institute Seat Configuration (Master Data)

Allow users to configure examination venues independently of any exam.

*Building Management*

* Users can create multiple buildings (e.g., Building A, Building B, Academic Building, etc.).
* Building names must be unique within an institution.
* Users may use predefined or custom building names.

*Room Management*

* Each building contains multiple rooms.
* Rooms have unique identifiers within their building (e.g., Room 101, Room 103, Lab-1).
* Users can freely create, edit, or remove rooms.

*Room Capacity*

* Each room stores its seating capacity.
* Example:

  * Room 101 → 80 seats
  * Room 103 → 60 seats

These configurations are generic institute settings and can be modified at any time.

##### B. Seat Plan Generation

When preparing an examination, users should be able to generate seat plans automatically.

*Requirements*

* Select one or multiple exams.
* Select one or multiple buildings.
* Users may:

  * Select an entire building (automatically includes all rooms), or
  * Select individual rooms only.
* Automatically distribute students according to room capacities.
* Automatically assign seating based on student roll numbers.
* Prevent room capacity overflow.
* Generate a clear, organized, and printable seat plan.

*Printing*
Produce high-quality print-ready reports suitable for notice boards.

The print layout should clearly display:

* Building Name
* Room Number
* Exam Name
* Class
* Section
* Subject
* Student Roll Range or Assigned Students

Since multiple classes, sections, and subjects may run simultaneously across different rooms and buildings, the generated seat plan must remain clean, organized, and easy to understand.

---

#### 3. Exam Schedule (Routine)

Implement an *Exam Schedule / Routine* publishing feature.

*Requirements*

* Create examination routines for each exam.
* Configure:

  * Subject
  * Date
  * Start Time
  * End Time
* Generate a professional printable routine.
* The layout should be optimized for notice board display.
* Students should be able to understand the schedule quickly at a glance.
* Support high-resolution printing with proper pagination.

---

#### 4. Exam Attendance Sheet

Implement an *Exam Attendance Sheet* for examination sessions.

*Requirements*

* Generate attendance sheets room-wise.
* Each attendance sheet should contain only the students assigned to that room.
* Include student information along with a blank signature column so students can sign after attending the examination.
* Include examination details such as:

  * Exam Name
  * Subject
  * Date
  * Time
  * Building
  * Room Number
* Provide blank signature sections at the bottom for:

  * Examiner / Invigilator
  * Exam Controller
  * Head Teacher (optional, if applicable)

The attendance sheet should be designed for easy use during examinations and printed in a professional format.

---

## General Printing Requirements (Applicable to All Reports)

Every printable document in the Exam Module should follow a consistent professional design.

*Requirements*

* High-resolution, print-ready output.
* Professional header containing institution information:

  * Institution Name
  * Address
  * Mobile Number
  * Email
  * EIIN
  * Other configured institution details
* Consistent typography and spacing.
* Proper use of bold text, highlights, borders, and colors without making the design look cluttered.
* Attractive yet professional visual appearance.
* Automatic pagination for multi-page documents.
* Maintain layout integrity regardless of page count.
* Ensure compatibility with standard A4 printing and commercial printers.

### Known Issues / Improvements

#### 1. Attendance Module Placement (Priority: Low)

* Move the *Attendance* module under the *Class & Curriculum* section.
* Attendance is directly dependent on class information, so its current placement feels inconsistent from both a logical and UX perspective.
* Relocating it under *Class & Curriculum* will make the navigation more intuitive and maintain a cleaner module hierarchy.

---

#### 2. Remove Shift Dependency Completely (Priority: High)

The current *Shift* dependency in the Attendance module is unnecessary and introduces additional complexity.

*Required Changes*

* Remove the *Shift* filter from the Attendance module.
* Remove all Shift-related dependencies throughout the system.
* If any legacy/stale *Shift* columns or database structures exist, they should be removed through a proper migration after ensuring no active dependencies remain.

*Reason*

* The system already collects:

  * Class
  * Section
* Neither class creation nor student admission currently depends on a separate Shift entity. Therefore, introducing Shift only during attendance is inconsistent.

*Recommended Approach*
Instead of maintaining a separate Shift module, represent shifts through section naming.

*Example*

* Class Eight

  * Morning - A
  * Morning - B
  * Day - C
  * Day - D

This approach:

* Eliminates unnecessary complexity.
* Keeps the data model simpler.
* Avoids duplicate filtering logic.
* Makes attendance, reporting, and student management more consistent across the entire system.

For any print mechanism (Mark sheet, class routine, attendance book) etc. Please follow this...
 
*Requirements*

* High-resolution, print-ready output.
* Professional header containing institution information:

  * Institution Name
  * Address
  * Mobile Number
  * Email
  * EIIN
  * Other configured institution details
* Consistent typography and spacing.
* Proper use of bold text, highlights, borders, and colors without making the design look cluttered.
* Attractive yet professional visual appearance.
* Automatic pagination for multi-page documents.
* Maintain layout integrity regardless of page count.
* Ensure compatibility with standard A4 printing and commercial printers.