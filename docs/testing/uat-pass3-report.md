# UAT Pass 3 — exit-gate walk for map #524

> Companion to [staging-owner-superadmin-uat-report.md](./staging-owner-superadmin-uat-report.md).
> That report is the *before*; this is the *after*, run against the branch that answers it.
> Where the two disagree about a cause, the annex at the end of the original explains why.

## Test Conditions

- **Build under test:** `feat/525-class-attachment-narrows-grant` (PR #549), production build — `next build && next start`.
- **Environment:** `http://localhost:3200` against the shared Supabase project `bwsnjtnxiypehbipdttp` — the same database staging and main use.
- **Why not staging:** the branch is not deployed. Staging runs pre-#524 code, so a pass against it would re-test the defects this map already fixed. A production build against the real database is the closest honest substitute, and it is *stricter* than staging in one way that matters: the CSP was also exercised in `CSP_MODE=enforce`, which staging has never run.
- **Test date:** 2026-08-29.
- **Personas:** 11 real logins — School Owner (two tenants), office staff with grants, staff with no grants, Class Teacher, Subject Teacher with no attachment, Student, Distributor, Agent, Gov Official, Super Admin.
- **Method:** scripted browser walk (`web/e2e/uat-pass3*.mjs`), real logins, real writes through the real UI, deep-link negatives, 390×844 phone viewport, header inspection, plus SQL counts quoted as literals rather than re-queried by the assertion.
- **Data:** everything created was prefixed `UAT3` and removed afterwards. The one exception is named under *Data left behind*.

## Release Decision

**No Blocker findings. No Major findings.** The three blockers the previous pass raised are closed: two never existed and are now disproved with numbers, the third is fixed and verifiable.

Two P1 items remain open, neither of which stops a school operating: unpaginated large lists (locations, exams) and one dead row in the screen registry. Both are recorded below with the numbers that describe them.

The remaining gate is deployment: this pass proves the build, not the deployed environment. Re-run the header scan and the CSP soak on staging once PR #549 is merged.

## Blockers from the previous pass

| Previous finding | Status | Evidence from this pass |
|---|---|---|
| `/super-admin/locations` renders no usable page (Blocker 1) | **Never existed** | The tree renders 5,218 nodes and 5,911 controls, network-idle in 5.7 s |
| Ledger out of balance by ৳2,800.00 (Blocker 2) | **Never existed** | The accounting page's own totals: debit ৳52,355,527.93 = credit ৳52,355,527.93. Whole-table SQL over 47,568 `gl_lines` gives a difference of exactly `0` |
| Owner→student workflows untrustworthy (Blocker 3) | **Closed** | Four owner→student journeys completed end to end, below |
| Class Teacher sees 82 students across classes (P0) | **Closed** | She sees 1 — the roster of her own class — in a school of 22. Another class's student by guessed id returns the Bangla 404, no metadata |
| `edume-auth` readable via `document.cookie` (P0) | **Closed** | Session cookie is HttpOnly; the browser walk found no readable session material |
| SMS pool `-981` presented as a usable balance (P0) | **Closed as a code defect, open as a data one** | The dashboard now leads with an impossible-state banner: "অসম্ভব অবস্থা: পুলের ব্যালেন্স ঋণাত্মক … বরাদ্দ ও সেটেলমেন্ট বন্ধ রাখুন". Purchased 1,001, sent 1,041, available −40 — a historical deficit the guard now prevents but does not erase |
| Fee collection form never appears (P1) | **Closed** | Journey 3 below |
| Repeated `InvoiceGenerated`, `0` items (P1) | **Closed** | The column is now labelled MAX TRIES and reads 0 because nothing is failing. 122 seen, 61 queued, **0 stuck** |
| Core actions 26–30 px on a phone (P2) | **Closed** | Print, Add, Archive and Upload Photo are 44 px on a phone and stay compact on a pointer device |

## Surface sweep

83 checks, **0 failing**. Every persona's every static surface, opened one at a time, plus the full cross-portal negative matrix.

| Persona | Routes opened | Rendered | Blank | Crashed | Console errors |
|---|---|---|---|---|---|
| School Owner | 33 | 33 | 0 | 0 | none |
| Student | 13 | 13 | 0 | 0 | none |
| Super Admin | 23 | 23 | 0 | 0 | none |
| Distributor | 5 | 5 | 0 | 0 | none |
| Agent | 2 | 2 | 0 | 0 | none |
| Gov Official | 1 | 1 | 0 | 0 | none |

Every persona was also pointed at every other portal's root — 55 deep-link negatives, all of which returned the caller's own home. No portal leaked another portal's shell.

The previous pass's "console recorded RSC fetch fallback errors" did not reproduce: zero console errors across all eleven personas.

## Access model — the ADR 0021 matrix

The rule under test: a Grant says which screens, a class attachment says which students, and where both are present the attachment is a **ceiling**.

| Caller | Expected | Observed |
|---|---|---|
| School Owner | whole school | 22 of 22 students ✓ |
| Office staff (grants, no `employees` row) | whole school | 22 of 22 ✓ |
| Class Teacher (holds `students` grant) | her own class only | **1 student**, not 22 ✓ |
| Class Teacher → another class's student by id | refused, no metadata | Bangla 404 ✓ |
| Employee with no attachment (Subject Teacher) | nothing, and an explanation | 0 rows with a class-assignment explanation ✓ |
| Owner of another tenant → this school's student id | refused | 404 ✓ |
| Owner of another tenant → this school's class id | refused | 404 ✓ |
| Student → a school record by id | refused | bounced to `/student` ✓ |
| Staff with no grant → `/school/fees` | refused, destination preserved | `permission-denied?from=/school/fees`, page names `/school/fees` and offers the dashboard ✓ |
| Office staff → granted `fees`, `classes` | opens | opens ✓ |
| Office staff → ungranted `exams`, `sms`, `staff` | refused | refused ✓ |

## Journeys the previous pass could not finish

All five are exit-gate items from the original report. All five now complete.

### 1. Owner notice → student read state

Owner published a notice; it appeared in the owner list, then in the student's list, and the student opened its detail page — `/student/notices/8978047c-…`. ✓

### 2. Student leave request → owner approval → student status

- Reversed dates refused with a field-level Bangla message: *"শেষের তারিখ শুরুর তারিখের আগে হতে পারে না।"* ✓
- Valid request accepted and shown as **অপেক্ষমাণ** (pending). ✓
- A second request over days already asked for was refused: *"এই তারিখগুলোর জন্য আবেদন আগেই করা আছে।"* — a duplicate guard the original pass never reached. ✓
- Owner approved from the leave queue; the student's own page then read **অনুমোদিত**. ✓

### 3. Fee collection → receipt → ledger, exactly once

The original blocker, walked end to end:

1. Class roster loaded with a collectable row. ✓
2. `আদায় করুন` opened the collection form — the P1 blocker, closed. ✓
3. First press on the primary button showed the receipt for review (**রসিদ দেখে নিন**) and wrote nothing. ✓
4. Second press wrote and landed on `/school/fees/receipt/75606737-…`. ✓
5. The receipt shows the ledger posting it produced. ✓
6. Refresh did not create a second receipt. ✓

The posting, read back from the database:

```
fee:75606737-4bbd-4767-8467-e29263630a87:1165   1000 (Cash)       debit  100
fee:75606737-4bbd-4767-8467-e29263630a87:1165   4300 (Fee Income) credit 100
```

One payment, one receipt, one balanced entry, in paisa.

### 4. Staff grant → access → revoke → denial

On the one fixture that holds no grants, so nothing another suite asserts on was disturbed:

1. Owner opened the staff screen-access page: 10 individually controllable screens. ✓
2. Flipped `fees` on (`false → true`). ✓
3. The staff user opened `/school/fees`. ✓
4. Owner flipped it back off (`back to false`). ✓
5. The same staff user was refused again, and the refusal names `/school/fees` and offers a way out. ✓

### 5. Owner-created exam → student-visible result

1. Owner created an exam. ✓
2. Marks entry **before** a class is attached refuses with the prerequisite — *"নম্বর এন্ট্রির আগে পরীক্ষা সেটআপে একটি শ্রেণি নির্বাচন করুন।"* — not a blank page. ✓
3. Owner attached the exam to a class, entered a mark, saved. ✓
4. Owner published results. ✓
5. The **student's** results page showed the exam with its subject. ✓
6. Teardown removed the exam **with its marks** — impossible before migration `0171`, which is what made this journey safe to run at all.

The student's *exam schedule* page did not show it, correctly: the exam has no routine rows, so nothing is scheduled to display.

## Performance

Production build, warm server, shared database. `dom` is time to `domcontentloaded`; `idle` is time to network idle.

| Route | dom | idle | rows |
|---|---|---|---|
| `/school` | 900 ms | 3.0 s | — |
| `/school/students` | 693 ms | 4.7 s | 22 |
| `/school/exams` | 658 ms | 5.1 s | — |
| `/school/exams/mark-sheet-preview` | 670 ms | **1.5 s** | — |
| `/school/classes/routine` | 671 ms | 2.6 s | — |
| `/school/fees` | 641 ms | 4.8 s | 20 |
| `/school/fees/ledger` | 722 ms | 3.1 s | 81 |
| `/school/attendance/mark` | 799 ms | 3.3 s | 24 |
| `/super-admin/locations` | — | 5.7 s | 5,218 nodes |

The previous pass's **31-second** mark-sheet preview did not reproduce: 1.5 s here. That figure was a cold serverless start on staging, not the page.

## Phone (390×844)

- **Horizontal overflow: 0 px** on `/school`, `/school/students`, `/school/attendance/mark`, `/school/fees`, `/school/exams`. No core action needs a sideways scroll.
- Remaining sub-44 px controls are shell chrome, not content actions: the visually-hidden skip link (1 px by design), the avatar button (36 px), logout (28 px), and the section tab chips (38 px).
- `/school/exams` reports 934 controls under 44 px — 566 links and 357 disabled buttons — because the list renders every exam on one page. That is the pagination finding below, seen from the phone.

## Language

- Bangla by default. ✓
- The English switch changes the page. ✓
- The choice survives a reload. ✓ — the defect the previous pass reported on mobile.

## Security headers

Checked on a production build:

| Header | Value | |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | ✓ |
| `X-Frame-Options` | `DENY` | ✓ |
| `Content-Security-Policy` | `frame-ancestors 'none'` — enforced from day one | ✓ |
| `Content-Security-Policy-Report-Only` | full nonce policy | ✓ |
| `X-Content-Type-Options` | `nosniff` | ✓ |
| `Referrer-Policy` | `same-origin` | ✓ |
| `Reporting-Endpoints` | `csp-endpoint="/api/csp-report"` | ✓ |
| `x-powered-by` | absent | ✓ |

Under `CSP_MODE=enforce` the proxy's header **replaces** the config one — exactly one `Content-Security-Policy` header, carrying the full policy including `frame-ancestors 'none'`. Signed in as an Owner, login, students, fees, attendance and a print route produced **zero** violations.

One thing this pass found and fixed on the spot: `upgrade-insecure-requests` is ignored in a report-only policy, and every browser logs a console error saying so — on every page, for every user. It is now emitted only when enforcing, because that noise is exactly what hides a real error.

## Findings

| Priority | Finding | Evidence |
|---|---|---|
| P1 | **Large lists render whole.** `/super-admin/locations` renders 5,218 nodes and 5,911 controls in one page; `/school/exams` renders 570 exam links. Both work, both are heavy on a low-end phone | 5.7 s to idle; 934 sub-44 px controls on the exam list |
| P1 | **An exam cannot be deleted from the UI by anyone.** There is no delete control on the list or the detail page. The 136 leftover `SP2 ` exams on the shared project have no product-level remedy; this pass had to remove its own exam through SQL | `app/school/exams` has no delete action |
| P2 | **The screen registry has a row with no page.** `subscription` is registered as a `member` screen, but `app/school/subscription` contains only server actions, so a deep link 404s. Nothing links to it | `/school/subscription` → 404 |
| P2 | **The SMS pool deficit is historical.** New sends can no longer drive it negative and the dashboard blocks on it loudly, but the existing −40 needs a reconciliation entry, not code | purchased 1,001, sent 1,041 |
| P3 | Shell chrome (logout 28 px, tab chips 38 px, avatar 36 px) is still under 44 px on a phone. Content actions are not | phone sweep |

None of these is a Blocker or a Major. Each is a ticketable improvement against a product that a school can operate today.

## Data left behind

- **One fee collection record of ৳1.00** in the test school, with its receipt and its balanced GL entry. Left on purpose: an issued financial document is immutable (ADR 0012), and deleting it to tidy a test would be the exact behaviour that ADR forbids.
- Everything else — 2 exams with their marks, 2 notices, 2 leave requests — was removed after the walk.

## What this pass does not cover

Named so the next person does not read silence as coverage:

- **The deployed environment.** Vercel's edge behaviour, the real TLS chain, an external header scanner, and the CSP report soak all need PR #549 merged first.
- **SMS sending and purchase, settlement approval, and invoice payment.** Irreversible money and third-party actions; inspected, not submitted — the same line the previous pass drew.
- **Gov Official territory reads.** The fixture has no territory assigned, so only the empty state was seen. Seed one non-production territory for a positive/negative pair.
- **Distributor CRM stage transitions and agent task evidence.** Both render; neither was mutated.
- **Screen readers, keyboard-only navigation and contrast.** A rendered page is not proof of WCAG conformance, and this pass measured geometry, not assistive technology.

## Reproducing this pass

```bash
cd web
npm run build && npx next start -p 3200
UAT_BASE=http://localhost:3200 node e2e/uat-pass3.mjs          # personas, surfaces, negatives
UAT_BASE=http://localhost:3200 node e2e/uat-pass3-access.mjs   # access matrix, phone, language, headers
UAT_BASE=http://localhost:3200 node e2e/uat-pass3-journeys.mjs # notice, leave, fee, grant, exam
UAT_BASE=http://localhost:3200 node e2e/uat-pass3-exam.mjs     # exam → marks → publish → student result
```

The scripts print one line per check and exit with a count. They write real data as real personas; read the header of each file before running one against anything you care about.
