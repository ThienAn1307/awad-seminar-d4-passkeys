---
name: feature-spec
description: Write or review a one-page feature specification in the CSC13114 template (Goal, Out of scope, Flow, Contract, Data, Errors, Acceptance, Constraints) that another student or an agent can implement without asking anything. Use for spec.md, "write a spec", "review my spec", or before a spec swap.
argument-hint: "[feature name or path to spec.md]"
---
# Feature spec (CSC13114 template)

A spec is graded by **the questions an implementer would have to ask**. Every gap = an invented
decision. Aim: someone could write the client and the tests from this page alone.

## Process
1. Gather ground truth: the brief, the rubric, the real system (smart-restaurant docs:
   `gh api repos/fithcmus/smart-restaurant/contents/<path>`; our own repo if it exists).
   Reuse its naming, auth, currency, endpoints style. Never invent facts about the existing system —
   if unverifiable, write it as a flagged **Assumption** in Constraints.
2. If key decisions are open, run `/grill-me` first (or ask with AskUserQuestion). Don't decide
   behaviour silently on the user's behalf — it's their spec and they must defend it.
3. Write in this exact shape:

```md
# <Feature>
Status: draft · Owner: <name> · Feature of: <system>

## Goal          one sentence
## Out of scope  bullet list — what this deliberately does NOT do (write these FIRST; reviewers read it first)
## Flow          numbered steps, happy path only
## Contract      every endpoint/event: method + path, request JSON, every status code with a named
                 error shape `{ "error": "snake_case_code" }`, auth, idempotency rule
## Data          tables/fields added, what is read, invariants (what must never change), rounding rules
## Errors        table: Condition | User sees | System does (status + code)
## Acceptance    AC1..ACn — concrete values, each one a test with no further decisions
## Constraints   no new deps, schema limits, compatibility, flagged assumptions
```

## Checklist before handing over (fix, don't just report)
- [ ] Five thin places each have an Error row AND an AC: **empty/first-run**, **partial failure**,
      **permissions** (who, to whose data), **concurrency & duplicates** (idempotency key, two taps
      same second), **limits** (and what happens *at* the limit).
- [ ] ACs cover split/arith-style math with exact numbers incl. a non-divisible case, ≥1 failure path,
      ≥1 concurrency case. No "works correctly" — if you can't imagine the test, it's a wish.
- [ ] Every status code in Contract appears in Errors, and vice versa. Error names consistent everywhere.
- [ ] Every state machine (e.g. unpaid→pending→paid) lists all transitions and who triggers them.
- [ ] Money in integer minor units; rounding remainder rule stated with a worked example.
- [ ] Async/external calls (payment gateways, webhooks) modelled as async: 202 + callback, signature check.
- [ ] Re-read as a hostile implementer: list the questions you'd ask; answer each in the spec.
- [ ] Still ~one page. Cut prose; keep contracts and ACs.

Then `/ai-log` the session.
