---
name: volantinipro-runtime-acceptance
description: VolantiniPro Runtime Acceptance Gate. Mandatory runtime verification skill for bugfixes, regressions, runtime, mobile, GPS, messaging, payment, dashboard, Step 2, performance, and production-validation tickets. Enforces "No runtime proof = no PASS", reproduction before fix, role-specific verification, firewall compliance, git safety, and rigorous multi-status reporting.
---

# VolantiniPro Runtime Acceptance Gate

> **CORE MANDATE**: **No runtime proof = no PASS.**  
> Automated tests, build success, lint success, mocks, static analysis, or local-only checks are **NOT** sufficient to declare a user-reported bug fixed.  
> A ticket is closed **ONLY** when the exact original user-reported scenario is verified at runtime after the fix.

---

## When This Skill Must Be Applied

This skill is **mandatory** for every ticket, task, or PR involving:
- Bugfixes and regressions
- Runtime behavior and state management
- Mobile / viewport-specific behavior
- GPS tracking and session coverage
- Messaging flows (WhatsApp, notifications, internal chat)
- Payment state flows and confirmations
- Admin, Customer, or Driver dashboards
- Step 2 Territorial Configurator (NIL, Radius, Comune, CAP)
- Performance claims and latency improvements
- Production verification and staging/live validation

---

## 20 Mandatory Acceptance Rules

### 1. Separate Statuses
Never collapse results into a single generic status. Every report must evaluate and provide separate statuses for:
- **CODE**: Syntax, architecture, clean implementation.
- **TESTS**: Unit, integration, automated test suite execution.
- **BUILD**: Compilation, bundling, TypeScript/Vite/production build.
- **RUNTIME**: Live execution in the browser, mobile viewport, or execution environment.
- **PRODUCTION**: Behavior against real or production-equivalent endpoints/APIs/databases.
- **ORIGINAL USER SCENARIO**: Exact reproduction flow verified post-fix.
- **REGRESSION**: Verification that adjacent flows/modules are undamaged.
- **PERFORMANCE**: Quantitative before/after timings (when applicable).
- **OVERALL**: Final verdict derived strictly from runtime reality.

### 2. No Generic "PASS"
Never declare a generic "PASS" when only code edits, linter runs, or automated tests have passed. If runtime verification has not occurred, the status is **NOT VERIFIED**.

### 3. Reproduce Before Fixing
Before writing or modifying code, document the exact reproduction details:
- **Route / URL**: (e.g., `/admin/dashboard`, `/preventivo?step=2`, `/driver/session`)
- **Role**: Admin, Customer, Driver / Operator, or Anonymous Guest.
- **Device / Viewport**: Desktop, Tablet, Mobile (specify viewport width, e.g., 375px, 390px, 414px).
- **Entity / Target**: Campaign ID, Order ID, Driver ID, Territory (NIL/Radius/Comune).
- **Action Sequence**: Step-by-step clicks, keystrokes, navigation.
- **Expected Behavior**: What should happen.
- **Actual Behavior**: The exact bug observed (with error messages, console logs, or network dumps).

### 4. Test the Same Scenario After the Fix
After the fix is implemented, execute the **identical** scenario: same route, same role, same device/viewport, same entity type, and same action sequence.

### 5. Role- and Domain-Specific Verification Requirements
- **Mobile issues**: Must be verified in real mobile viewports (e.g., 375x667, 390x844, 414x896) checking touch targets, drawer/modal interactions, overflow, keyboard avoidance, and viewport height.
- **Driver issues**: Must be verified through the real Driver token / session flow (not mock admin masquerading).
- **Customer issues**: Must be verified through the real Customer dashboard, onboarding, or checkout flow.
- **Admin issues**: Must be verified with authenticated Admin session credentials, checking real query execution and state refreshes.
- **Territory / Step 2 issues**: Must be verified using the exact territory reported (specific Municipality, NIL, Radius, or CAP).
- **WhatsApp issues**: Must verify actual phone number formatting, exact recipient, campaign name, compensation/pricing, and valid program link.
- **Payment issues**: Must verify the actual database state transition (e.g., `pending` -> `confirmed`), ledger entries, and side effects.
- **Performance issues**: Must measure and present concrete before/after timings (TTFB, DOM render, API response time, bundle size).

### 6. Inability to Test Scenario = NOT VERIFIED
If the exact scenario cannot be tested due to environment constraints, missing credentials, or external API limits:
- Status for `ORIGINAL USER SCENARIO` and `RUNTIME` must be marked **NOT VERIFIED** or **PARTIALLY VERIFIED**.
- The blocker must be explicitly documented with instructions for manual verification.

### 7. User Runtime Screenshots Override Green Tests
If a user or QA provides a screenshot or screen recording showing an error, broken layout, or failed state, that evidence completely overrides passing automated tests. Green tests with broken UX is a **FAIL**.

### 8. Database and State Mutation Standards
For any bug involving database records or application state:
- **Persistence**: Data must persist across page reloads and browser restarts.
- **Reload**: Refreshing the page must not revert data to stale or default values.
- **No Duplicates**: Repeated actions must be idempotent (no duplicate rows, payments, or notifications).
- **No Stale State**: Cache invalidation must guarantee fresh data without requiring cache-busting workarounds.
- **No Unintended Mutation**: Changing one entity must not mutate unrelated columns or sibling records.

### 9. Measurable Performance Evidence
Performance claims (e.g., "optimized dashboard query", "faster map loading") require quantitative before/after benchmarks. Vague statements like "feels faster" or "improved efficiency" are classified as **PERFORMANCE: NOT PROVEN**.

### 10. Distinct Loading and Empty States
Every UI view handling asynchronous data must distinguish between four separate states:
1. **Loading**: Active spinner, skeleton, or progress indicator while request is in flight.
2. **Zero / Empty**: Data loaded successfully, count is 0 (render helpful empty state).
3. **Unavailable**: Feature or integration not configured / disabled (graceful fallback).
4. **Error**: Network or API failure (render actionable error banner with retry option).  
*Never show "No data found" while data is still loading or when an error occurred.*

### 11. Network and API Error Traceability
Any network or API failure must be inspected down to:
- HTTP method and full endpoint URL.
- Request headers and payload.
- HTTP status code (400, 401, 403, 404, 409, 422, 500).
- Response body (Supabase error code, PostgREST hint, Postgres constraint name).

### 12. Supabase / PostgREST Contract Auditing
When diagnosing Supabase issues:
- Check table schema, column naming, nullability, foreign keys, and RLS policies.
- Ensure column selects match existing columns (avoid selecting dropped columns or `*` on unbounded joins).
- Verify PostgREST syntax (e.g., `.eq()`, `.is()`, `.in()`, embedded relations `.select('*, items(*)')`).

### 13. Territory Contract Preservation
Territorial data models must never be coerced or conflated:
- **NIL** remains strictly **NIL** (Nuclei di Identità Locale).
- **Radius** remains strictly **Radius** (center point + distance in km).
- **Comune** remains strictly **Comune** (ISTAT code + municipality name).
- **CAP** remains strictly **CAP** (postal code string).
- Always address zones and selections via **stable IDs**, never array indexes.

### 14. Raw GPS Integrity
Raw GPS coordinates (`lat`, `lng`, `accuracy`, `recorded_at`) must **NEVER** be artificially modified, smoothed out of bounds, or fabricated to force an acceptance test or coverage algorithm to pass. Real driver tracks must be treated as immutable historical truth.

### 15. Messaging Architecture Contract
The platform communication model is strictly hub-and-spoke:
- **Customer ↔ Admin**: Permitted.
- **Driver / Operator ↔ Admin**: Permitted.
- **Customer ↔ Driver**: **STRICTLY PROHIBITED**. Direct communication between customers and drivers must never be enabled.

### 16. WhatsApp Message Runtime Proof
Any fix affecting WhatsApp integration must verify the full message payload:
- Target recipient phone number (E.164 format, e.g., `+39...`).
- Correct role recipient (Admin, Customer, Driver).
- Campaign name / ID.
- Exact monetary amounts (compensation or quote total).
- Fully formed, valid program/tracking link.

### 17. Payment State Verification
Payment correctness cannot be inferred from UI text changes alone. Runtime verification must confirm:
- State change in database (`quote_requests`, `orders`, or `campaigns` table).
- Triggering of downstream ledger or notification events.
- UI state updates dynamically without requiring manual DB tampering.

### 18. Failure Rule
If **any** single mandatory runtime condition fails:
**OVERALL = FAIL**

### 19. Missing Evidence Rule
If runtime evidence is missing, incomplete, or based solely on static/mock assertions:
**OVERALL = NOT VERIFIED**

### 20. Mandatory Final Report Format
Every task completion report must end with this exact structure:

```text
ROOT CAUSE:
<Detailed description of the underlying defect and why it occurred>

FILES CHANGED:
<List of files modified, created, or deleted>

CODE:
PASS / FAIL

TESTS:
PASS / FAIL

BUILD:
PASS / FAIL

RUNTIME:
PASS / FAIL / NOT VERIFIED

PRODUCTION:
PASS / FAIL / NOT VERIFIED

ORIGINAL USER SCENARIO:
PASS / FAIL / NOT VERIFIED

REGRESSION:
PASS / FAIL / PARTIAL / NOT VERIFIED

PERFORMANCE:
PASS / FAIL / NOT PROVEN / NOT APPLICABLE

OVERALL:
PASS / FAIL / NOT VERIFIED / PARTIALLY VERIFIED
```

---

## VolantiniPro Core Firewall

Unless explicitly requested by the ticket specification, **DO NOT MODIFY** the following protected subsystems:

- **Step 2 pricing engine** (`src/lib/pricing/`, calculation algorithms)
- **analysis-istat** datasets and lookup logic
- **Territory boundaries**: NIL, Radius, CAP, and Municipio definitions
- **Raw GPS pipelines**: `gps_tracking_points`, GPS intake endpoints
- **Delivery sessions**: `delivery_sessions` state machine and session classifiers
- **Driver token architecture**: Token generation, validation, and session access
- **Payment state logic**: Transaction workflows, Stripe/PayPal webhooks
- **Supplier / Operator compensation logic**: Rate cards and compensation payouts
- **Customer pricing tiers**: Margin calculations and volume discounts
- **Photo pipeline**: Proof photo upload, watermark verification, and storage paths
- **Admin authentication**: Supabase auth guards, role checks, and AdminGuard
- **Unrelated database schemas and migrations**

> [!CAUTION]
> **Firewall Violation Protocol**: If a ticket genuinely requires modifying any of these protected subsystems, you must **STOP** and document the explicit rationale, potential ripple effects, and obtain user approval before proceeding.

---

## Git Safety Procedures

To prevent accidental code loss, merge disasters, and worktree corruption:

### Banned Git Commands
- `git reset --hard`
- `git restore .`
- `git checkout .`
- `git clean` (with any flags)
- `git push --force` or `--force-with-lease`

### Pre-Coding Protocol
Before writing any code or applying patches:
1. Run `git fetch` to retrieve remote updates.
2. Inspect local HEAD (`git rev-parse HEAD`).
3. Inspect remote HEAD (`git rev-parse origin/<branch>`).
4. Inspect working tree status (`git status`).
5. Review untracked files and ensure no peer work is overwritten.
6. Check peer commits (`git log -n 5 origin/<branch>`).

### Staging Protocol
- **NEVER** run blanket staging commands like `git add .` or `git add -A`.
- Stage only explicit target files: `git add <exact-file-path>`.
