---
name: implement-from-spec
description: Implement a feature strictly from someone else's spec (the CSC13114 spec swap) without asking the author anything, logging every ambiguity and invented decision to questions.md with severity. Use when the user received a peer's spec.md to build, or says "implement this spec" in a swap/lab context.
argument-hint: "[path to the received spec]"
---
# Implement from a peer's spec

The spec at `$ARGUMENTS` is the **only** brief. The author may not be asked. The questions list we
produce is graded on them and returned to them — make it precise, fair, and useful.

## Rules
- Do not fill gaps silently. Every time the spec doesn't decide something you need, record it
  **before** choosing, then pick the most conservative reading and continue.
- Don't fix the spec's design to your taste; implement what it says. If it is contradictory, log it.
- No new dependencies unless the spec allows them.

## questions.md format
```md
# Questions on <spec title> — implementer: <name/ID>, <date>

| # | Spec section | Question | Severity | What I assumed to proceed |
|---|---|---|---|---|
| Q1 | Data / rounding | Which share gets the remainder đồng when total % ways ≠ 0? | behaviour | share 1 gets it |
```
Severity: **blocking** (could not proceed) · **behaviour** (changes what the system does / a test
outcome) · **contract** (shape, status code, field name unclear) · **naming/cosmetic**.
Order by severity. One question per row — don't bundle.

## Process
1. Read the whole spec. First pass: list questions from Out of scope, Contract, Data, Errors, ACs —
   especially the five thin places (empty, partial failure, permissions, concurrency, limits).
2. Turn each AC into a failing test first (`/ac-to-tests`). An AC that cannot become a test → question.
3. Implement until the tests pass. Append questions as you hit them.
4. Finish with a short `IMPLEMENTATION-NOTES.md`: what was built, which ACs pass/fail, every assumption.
5. `/ai-log` the session.
