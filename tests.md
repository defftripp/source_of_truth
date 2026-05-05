# Testing Rules for Coding Agent

## Core Philosophy
You are a testing perfectionist. Every line of code you write or modify MUST be accompanied by exhaustive tests. Your goal is 100% branch coverage, 100% line coverage, and coverage of every meaningful behavioral scenario. Untested code is broken code.

## General Testing Principles

### Coverage Requirements
- **Line coverage**: 100% target, 95% minimum
- **Branch coverage**: 100% target, 95% minimum
- **Function coverage**: 100% — every exported and internal function must be tested
- **Edge case coverage**: Every boundary condition, null/undefined, empty input, overflow, and type coercion must have a dedicated test
- You MUST run coverage reports after writing tests and iteratively add missing tests until thresholds are met

### Test Structure
- Follow the **AAA pattern**: Arrange → Act → Assert
- One logical assertion per test (multiple `expect` calls are fine if they assert the same behavior)
- Use descriptive test names: `should return 404 when user is not found` not `test1`
- Group tests with `describe` blocks by: module → function/method → scenario category
- Use nested `describe` for complex scenarios:
```
  describe('UserService')
    describe('createUser')
      describe('when input is valid')
      describe('when input is invalid')
      describe('when database fails')
```

### What to Test — The Exhaustive Checklist
For EVERY function/endpoint/component, systematically cover:

1. **Happy path** — nominal input, expected output
2. **Empty inputs** — `null`, `undefined`, `""`, `[]`, `{}`, `0`, `NaN`
3. **Boundary values** — min, max, off-by-one, MAX_SAFE_INTEGER, empty string vs whitespace
4. **Invalid types** — string where number expected, object where array expected
5. **Error paths** — thrown exceptions, rejected promises, error responses
6. **Async behavior** — race conditions, timeouts, retries, concurrent calls
7. **State transitions** — before/after, sequential calls, idempotency
8. **Permissions & auth** — unauthenticated, unauthorized, expired tokens, role-based access
9. **Pagination & limits** — first page, last page, out-of-range page, zero results
10. **Concurrency** — parallel mutations, optimistic locking, duplicate submissions

---

## Backend Testing Rules

### Unit Tests
- Test every service method, utility function, helper, validator, and transformer in isolation
- **Mock all external dependencies**: database, HTTP clients, message queues, file system, third-party APIs
- Test every conditional branch — if a function has 4 `if` statements, you need tests that exercise every combination
- Test custom error classes and error formatting
- Test middleware independently (auth, validation, rate limiting, logging)
- Test serialization/deserialization (DTOs, transformers, mappers)

### Integration Tests
- Test every API endpoint with a real (or in-memory) database
- For EACH endpoint, test:
  - ✅ Success with valid payload → correct status code + response body
  - ❌ Validation failure (missing required fields, wrong types, too long, too short, invalid format)
  - 🔒 Authentication: missing token, expired token, malformed token
  - 🚫 Authorization: forbidden for wrong role, allowed for correct role
  - 🔍 Not found: accessing non-existent resources → 404
  - ⚡ Conflict: duplicate creation, stale updates → 409
  - 💥 Internal error: simulated DB failure → 500 with safe error message (no leaking internals)
  - 📄 Pagination: `?page=1&limit=10`, `?page=999`, `?limit=0`, `?limit=-1`
  - 🔎 Filtering & sorting: every supported filter param, combined filters, invalid filter values
  - 📦 Response shape: assert exact JSON structure, not just status codes
- Test database transactions: rollback on failure, commit on success
- Test cascade deletes, soft deletes, and referential integrity
- Test rate limiting and throttling responses
- Test CORS headers, content-type negotiation
- Test file uploads: valid file, too large, wrong MIME type, empty file, multiple files

### Database Tests
- Test migrations: up and down for every migration
- Test seeds: verify seed data integrity
- Test complex queries: joins, aggregations, subqueries
- Test indexes are used (via `EXPLAIN` where applicable)
- Test unique constraints, foreign key constraints, check constraints

### Event / Queue / Job Tests
- Test event emission: correct event name, correct payload
- Test event handlers: correct processing, idempotency, dead-letter handling
- Test job scheduling: timing, retries, failure handling
- Test webhook delivery: payload format, retry logic, signature verification

---

## Frontend Testing Rules

### Component Unit Tests
- Test every component in isolation with mocked dependencies
- For EACH component, test:
  - **Rendering**: renders without crashing with default props, renders with all prop combinations
  - **Props**: every prop value (valid, edge, missing/undefined, wrong type with PropTypes/TS)
  - **Conditional rendering**: every `{condition && <Element>}` branch — both truthy and falsy
  - **User interactions**: click, double-click, hover, focus, blur, keypress (Enter, Escape, Tab), touch
  - **Form inputs**: type text, clear, paste, special characters, max length, empty submit
  - **Form validation**: every validation rule (required, minLength, maxLength, pattern, custom validator)
  - **Loading states**: skeleton/spinner shown during async, hidden after resolve/reject
  - **Error states**: error message displayed, retry button works, error boundary catches crashes
  - **Empty states**: no data → empty state UI shown correctly
  - **Accessibility**: correct ARIA attributes, keyboard navigation, screen reader text, focus management
  - **Responsive behavior**: if component changes at breakpoints, test each breakpoint

### State Management Tests
- Test every reducer/slice/store action
- Test state transitions for every action type
- Test selectors with various state shapes (empty, populated, partial)
- Test derived/computed state
- Test middleware and side effects (thunks, sagas, effects)
- Test state persistence and rehydration if applicable

### Hook Tests
- Test every custom hook in isolation using `renderHook`
- Test initial state, state after actions, cleanup on unmount
- Test dependency array behavior — re-run when deps change, skip when they don't
- Test error handling within hooks
- Test hooks with different parameter combinations

### API Layer / Data Fetching Tests
- Mock all network requests (MSW, nock, or manual mocks)
- Test success responses: correct data transformation and caching
- Test error responses: 400, 401, 403, 404, 500 — each handled differently in UI
- Test network failure: timeout, offline, DNS failure
- Test request formatting: correct URL, method, headers, query params, body
- Test retry logic, token refresh, request cancellation
- Test optimistic updates and rollback on failure
- Test loading, error, and success states for every query/mutation

### Routing Tests
- Test every route renders the correct page/component
- Test protected routes: redirect to login when unauthenticated
- Test role-based routes: redirect to forbidden when unauthorized
- Test 404 fallback for unknown routes
- Test route params and query string parsing
- Test navigation (back, forward, programmatic navigation)
- Test deep linking and direct URL access

### E2E / Integration Tests (Frontend)
- Test critical user flows end-to-end:
  - Sign up → verify email → login → dashboard
  - CRUD operations: create → read → update → delete → verify deletion
  - Search → filter → sort → paginate → select → bulk action
  - Form wizard: step 1 → step 2 → back → step 2 → submit
  - File upload → preview → submit → success confirmation
- Test cross-browser concerns if applicable
- Test mobile/touch interactions

---

## Test Quality Rules

### Anti-Patterns — NEVER Do These
- ❌ Never write a test that always passes regardless of implementation
- ❌ Never test implementation details (internal state, private methods, CSS class names)
- ❌ Never use `test.skip` or `xit` — fix or remove broken tests
- ❌ Never use hardcoded timeouts (`setTimeout(done, 3000)`) — use proper async utilities
- ❌ Never assert only status codes without checking response bodies
- ❌ Never leave `console.log` in test files
- ❌ Never share mutable state between tests — each test must be independent and idempotent
- ❌ Never mock what you're testing — only mock dependencies

### Required Patterns
- ✅ Use factory functions or fixtures for test data — never inline raw objects
- ✅ Clean up after tests: reset mocks, clear databases, restore timers
- ✅ Use `beforeEach` for shared setup, not `beforeAll` (unless expensive and read-only)
- ✅ Test the public API/contract, not the implementation
- ✅ Use snapshot tests ONLY for stable UI structures — prefer explicit assertions
- ✅ Use parameterized tests (`test.each` / `it.each`) for repetitive scenarios with different inputs
- ✅ Every bugfix MUST include a regression test that fails without the fix

### Test Naming Convention
```
should [expected behavior] when [scenario/condition]
```
Examples:
- `should return empty array when no users match the filter`
- `should show validation error when email format is invalid`
- `should redirect to login when token is expired`
- `should retry 3 times when API returns 503`

---

## Workflow

1. **Before writing any implementation code**, outline the test cases you will write
2. Write tests first (TDD) or immediately after implementation — never defer
3. Run the full test suite and verify all tests pass
4. Run coverage report — if below 95%, add more tests immediately
5. Review test quality: are you testing behavior or implementation? Fix if needed.
6. For every PR/change: at minimum 3x more test lines than implementation lines