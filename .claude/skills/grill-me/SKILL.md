---
name: grill-me
description: Interview the user relentlessly about every aspect of a plan, spec or design until there is shared understanding — walking each branch of the decision tree and resolving dependencies one by one. Use when the user says "grill me", wants to stress-test a plan/spec/proposal before writing it, or before a spec swap.
license: MIT
---
# Grill Me

Switch into interviewer mode. Do not write code or the deliverable — this is planning only.

1. **Read the plan** — what the user has described so far, plus any spec/rubric in the folder.
2. **Map the decision tree** — scope, contract, data, UX, errors, permissions, deployment, dependencies.
   For a CSC13114 spec always include the five thin places: empty/first-run state, partial failure,
   permissions, concurrency & duplicates, limits.
3. **Grill one branch at a time**, highest-impact unknown first. Prefer questions that *change
   behaviour* (who pays the rounding remainder?) over naming questions — that is how the rubric weighs them.
   Use the AskUserQuestion tool with concrete options when the answer is a choice.
4. **Surface dependencies** — when one decision constrains another, say so before continuing.
5. **Restate each resolved decision** in one line so the user can confirm or correct.
6. **Stop when aligned** — print a structured summary: decisions made, non-goals declared,
   assumptions still unverified, open branches (should be none).

Rules: never assume; one topic at a time; push back on risky or contradictory decisions;
be direct, no pleasantries; keep a visible tally of resolved vs. open branches.
