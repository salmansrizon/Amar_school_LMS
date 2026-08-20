You are working on the EdumeBD / Amar School LMS codebase.
I have provided the current project/source. Before changing anything, inspect the existing implementation and understand the current Exams & Results navigation/state flow. Do not guess route names, component names, or architecture.
TASK
Fix the Exams & Results → Exams list action/navigation UX.
There are TWO related requirements:
Add two missing direct action buttons to every existing exam row.
Fix the broken back-navigation / return-state behavior for Exam Documents and the related Exam Routine / Seat Plan pages.

1. CURRENT EXAMS LIST
In:
Exams & Results → first tab
the page contains the existing exams list.
Each exam currently shows these four actions:
Basic Info
Marks Entry
Co-curricular
Exam Documents
Change this to SIX actions, in this exact logical order:
Basic Info
Marks Entry
Co-curricular
Generate Seat Plan
Make Exam Routine
Exam Documents
IMPORTANT
Generate Seat Plan and Make Exam Routine are NOT new features.
The corresponding Seat Plan and Exam Routine pages already exist in the application.
Do NOT duplicate these pages or create parallel implementations.
Find the existing navigation/routes/components and reuse them.
Each button must open the corresponding page for the specific exam whose row was clicked.

2. EXAM DOCUMENTS POPUP
The existing Exam Documents button opens a popup containing options such as:
Exam Routine
Seat Plan
Admit Cards
Attendance Sheets
Mark Sheets & Progress Reports
Result Book
Batch Print
The popup itself is correct and should remain.
When the user selects an option:
Close/hide the Exam Documents popup.
Navigate to the selected document/page for that exam.
Do not leave the popup artificially present in navigation/history/state.

3. CURRENT BROKEN BACK BEHAVIOR
The current navigation behaves like a chain of internal implementation screens.
For example:
Exam list → Exam Documents → Exam Routine → Back → Exam Routine generation/setup screen → Back → Basic Info / Exam Setup → Back → Exams & Results page at the TOP
Seat Plan has a similar problem:
Exam list → Exam Documents → Seat Plan → Back → Seat Plan creation/generation page → Back → Basic Info / Exam Setup → Back → Exams & Results
This is WRONG.
The user should never have to unwind through these intermediate screens merely because those screens were involved internally in constructing the destination.

4. REQUIRED BACK BEHAVIOR
The exam list row is the navigation origin.
If I am looking at, for example:
Test Exam (2026)
and open any destination from that exam row or its Exam Documents popup:
Exam row → destination page → Back
the result must be:
the Exams & Results first tab, restored to that same exam row.
There must be NO intermediate Basic Info / Exam Setup / Generate Seat Plan / Make Exam Routine screen unless the user explicitly navigated to that screen themselves.
Examples:
Exam Routine via popup
Test Exam row → Exam Documents → Exam Routine → Back → Test Exam row
Seat Plan via popup
Test Exam row → Exam Documents → Seat Plan → Back → Test Exam row
Direct new button
Test Exam row → Make Exam Routine → Back → Test Exam row
Direct new button
Test Exam row → Generate Seat Plan → Back → Test Exam row
The same principle should apply to other Exam Documents destinations where applicable.

5. RESTORE THE EXACT LIST CONTEXT
Returning merely to the Exams & Results URL is not sufficient.
The exams list may be long and the user may have scrolled far down.
When returning, preserve/restore as much of the original list state as reasonably possible, including:
Exams & Results first tab
current search/filter state
current list state
scroll position or equivalent exam-row anchor
the exam that launched the destination
The user should visually return to the same exam row they were working on, not to the top of the page.
Prefer a robust row-anchor/scroll restoration mechanism if that fits the existing architecture better than raw pixel scroll restoration.

6. NAVIGATION SEMANTICS
Do NOT solve this by adding arbitrary extra history.back() calls.
Do NOT create fragile chains such as:
back() → back() → back()
That merely hides the underlying navigation problem.
Instead, inspect how navigation currently works and fix the navigation origin / history / return target semantics.
A destination opened from an exam-list action should know that its logical return destination is:
Exams & Results → first tab → originating exam row
Internal setup/generator pages must not accidentally become user-visible back-stack destinations when the user did not explicitly navigate through them.
If the same destination page can be entered from multiple places in the application, preserve those legitimate flows. The return behavior should respect the actual navigation origin, rather than globally hardcoding every Back action to the exam list.

7. DO NOT BREAK EXISTING FUNCTIONALITY
Preserve:
Basic Info
Marks Entry
Co-curricular
Exam Documents popup
existing Exam Routine functionality
existing Seat Plan functionality
printing
publishing
attendance sheets
admit cards
marks/progress reports
result book
batch printing
exam-specific IDs/data
existing desktop/mobile responsive behavior
Do not perform unrelated redesign or refactoring.
Use the application's existing design language for the two new buttons.

8. INVESTIGATE BEFORE EDITING
Before making changes, trace:
The component/page rendering the exam rows.
How the four existing action buttons navigate.
How Exam Documents opens its modal/popup.
The route/component used by existing Exam Routine.
The route/component used by existing Seat Plan.
Why Back currently exposes generator/setup/Basic Info pages.
How Exams & Results tab state is stored.
How search/filter state is stored.
How list scroll position can be restored safely.
Whether browser history, router state, query parameters, session state, or component state is currently being used.
Then implement the smallest coherent fix consistent with the existing architecture.

ACCEPTANCE TESTS
The implementation is not complete until all of these pass.
A — Buttons
Every exam row contains:
Basic Info | Marks Entry | Co-curricular | Generate Seat Plan | Make Exam Routine | Exam Documents
B — Correct exam
Clicking either new button for Exam A opens the existing page using Exam A, never another exam or a generic setup state.
C — Popup closes
Opening a destination from Exam Documents closes the popup before/while navigating.
D — Routine return
Exam row → Exam Documents → Exam Routine → Back
 = same exam row
E — Seat Plan return
Exam row → Exam Documents → Seat Plan → Back
 = same exam row
F — Direct Routine return
Exam row → Make Exam Routine → Back
 = same exam row
G — Direct Seat Plan return
Exam row → Generate Seat Plan → Back
 = same exam row
H — No phantom navigation
Back must NOT expose:
Basic Info
Exam Setup
generator/setup screens
previously hidden modal state
unless the user actually navigated to those screens explicitly.
I — Scroll restoration
Scroll down to an exam near the bottom → open a destination → Back
 = return to that exam's location, not the top of the list.
J — Filters
Apply search/class/status filters → open an exam action → Back
 = filters remain intact and the originating exam remains in context.
K — Multiple exams
Repeat the tests using at least two different exams to ensure exam ID/context is not accidentally hardcoded.
L — Browser/mobile Back
Test the application's visible Back control and browser/Android Back behavior where applicable.

IMPLEMENTATION DISCIPLINE
Do not patch symptoms.
Do not duplicate existing Exam Routine or Seat Plan functionality.
Do not hardcode exam IDs.
Do not globally alter Back behavior in a way that breaks other entry points.
Do not reset the Exams & Results component unnecessarily if its state can be preserved.
Do not introduce a new navigation framework if the current one can support this correctly.
Keep the change narrowly scoped and production-safe.
After implementation, report:
Root cause of the incorrect navigation.
Files changed.
Navigation/state strategy used.
How the originating exam row/scroll position is restored.
How direct buttons reuse the existing Seat Plan and Exam Routine implementations.
Any behavior intentionally left unchanged.
Results of the acceptance tests above.
Do not declare the task complete simply because the pages open. The critical requirement is that opening AND returning behaves correctly.

