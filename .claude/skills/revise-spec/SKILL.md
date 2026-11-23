---
name: revise-spec
description: Revise a spec after receiving the implementer's question list — answer every question visibly in spec-revised.md and produce a traceability table. Use when the user has questions.md back from a spec swap, or asks to write spec-revised.md.
argument-hint: "[folder containing spec.md and questions.md]"
---
# Revise a spec from the question list

Rubric (IA#1 "Revision", 10 pts): top band = *every question answered in the revised spec, and the
changes are visible*. Ignoring a question without a reason drops to 5–8.

## Process
1. Read `spec.md` and `questions.md`. Classify each question: behaviour / contract / naming, and
   whether the original spec already answered it (implementer missed it) or it was a real gap.
2. For each **real gap**: decide the answer **with the user** (AskUserQuestion with concrete options
   for behaviour decisions — they own and defend the spec). Then edit the right section: Contract,
   Errors row, Data invariant, and add/adjust an AC so the answer is testable.
3. For questions the spec **already answered**: don't just say "it's there" — make that text easier to
   find/clearer (the question proves it was unclear).
4. Questions we decline (out of scope): add a line to **Out of scope** with the reason.
5. Write `spec-revised.md` = full revised spec (copy of spec.md + edits; never edit spec.md itself),
   ending with:
```md
## Revision log
| Q# | Question (short) | Answer | Changed in |
|---|---|---|---|
| Q1 | remainder đồng? | share 1..r get +1đ | Data §Rounding, AC2 |
```
6. Check: every Q# from questions.md appears in the log; no section contradicts another; still ~1 page
   (+ log). Offer a diff: `git diff --no-index spec.md spec-revised.md`.
7. `/ai-log` the session.
