---
name: self-assessment
description: Grade a CSC13114 submission against its rubric criterion by criterion and write SELF_ASSESSMENT_REPORT.md with evidence pointers and an honest "What I did not manage" — calibrated to land within ±10 of the real mark. Use before submitting, when the user asks "what score should I give myself", "self-assess", or "check my work against the rubric".
argument-hint: "[assignment folder]"
---
# Self-assessment report

Template + honesty rules: [references/TEMPLATE.md](references/TEMPLATE.md). Read it.

## Process
1. Load the rubric (PDF in the folder) and every deliverable. Missing rubric → stop and ask for it.
2. **Grade like a strict TA, per criterion.** For each band, quote the band text, then check the
   deliverable against it literally. Find the weakest evidence, not the strongest. Look for:
   ACs that are wishes, status codes in Contract missing from Errors, thin places with no AC,
   features claimed but untested, files the rubric demands that don't exist.
3. Give the user a **pre-submission fix list first** — anything fixable in < 30 min that moves a band.
   Fixing beats claiming.
4. Then draft the table. Each Evidence cell must point at something checkable:
   `spec.md §Contract`, `AC7`, `tests/split.test.js "AC9 — …"`, commit `abc1234`. No adjectives.
   A criterion that can't be assessed yet (e.g. depends on a later swap) → leave blank and say why.
5. **Calibrate**: claimed total should be what a fair grader gives, not the max. Over-claiming
   +11..+20 costs −3, +21..+30 −6, >+30 −10; under-claiming −21 or worse costs −3. When torn between
   two numbers, pick the lower unless evidence is airtight.
6. "What I did not manage" is graded as honesty — always write a frank paragraph on an imperfect
   submission. Add "What I would do differently" (one or two lines).
7. The scores claimed are the **user's decision** — present my suggested numbers with reasoning and
   let them adjust. Then tell them the zip name this total implies and offer `/package-submission`.
