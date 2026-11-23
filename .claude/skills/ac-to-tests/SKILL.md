---
name: ac-to-tests
description: Turn a spec's acceptance criteria (AC1..ACn) into runnable automated tests, one test per criterion with the AC id in the test name — API tests for Express (Vitest/Jest + Supertest), UI flows with Playwright. Use when the user says "write tests from the spec", "the spec is the test plan", or before implementing a feature.
argument-hint: "[path to spec.md]"
---
# Acceptance criteria → tests

"Acceptance criteria become test names, one for one." — session 2.

1. Read the spec's **Acceptance** section (and Contract/Errors for exact payloads and codes).
2. Detect the project's existing test setup (`package.json` scripts/devDeps). Use what exists.
   If nothing exists, propose (don't silently add): **Vitest + Supertest** for an Express API,
   **@playwright/test** for browser flows. Adding a dev dependency → confirm with the user.
3. One test per AC, named exactly `AC<n> — <short claim>`; assert the concrete values from the AC
   (amounts, status codes, error names, row counts). Keep the AC text as a comment above the test.
4. Concurrency ACs: fire requests with `Promise.all` and assert on the final DB state and the set of
   responses (e.g. exactly one 201 + one 409), not on ordering.
5. External services (payment gateway, LLM): stub at the boundary; callbacks are tested by calling the
   callback endpoint directly with a valid/invalid signature.
6. Run the tests. Before the implementation exists they should **fail for the right reason**
   (404 / not implemented), not because of a broken test.
7. Report a table: AC | test file:line | status. Any AC that couldn't become a test = it's a wish →
   tell the user which spec line to tighten.
