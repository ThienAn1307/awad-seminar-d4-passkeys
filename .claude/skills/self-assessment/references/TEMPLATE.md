# SELF_ASSESSMENT_REPORT.md — template (CSC13114, from Classroom)

Every submission contains this file, at the root of the zip. Score yourself against **the rubric of
that assignment**, criterion by criterion. The total goes into the zip name:
`<StudentID>_<total>.zip`, or `<StudentID1>-<StudentID2>-<StudentID3>_<total>.zip` for group work
(IDs ascending).

## What to write

```md
# Self-assessment — IA#1

Submitted by: <student ID> — <full name>        (group work: one line per member)

Total I claim: 82 / 100

| Criterion | Max | I claim | Evidence |
|---|---|---|---|
| Contract | 25 | 22 | spec.md §Contract — endpoints, payloads, 3 status codes |
| Acceptance criteria | 25 | 20 | AC1–AC4; AC4 has no concrete value yet |
| Edge cases and non-goals | 20 | 18 | §Errors covers 4 of the 5; non-goals written |
| Implementability | 20 | 14 | 2 behaviour questions came back: rounding, who may split |
| Revision | 10 | 8 | spec-revised.md answers both, see the diff |

## What I did not manage
AC4 ("limits") is still a wish — I could not decide the page size without
knowing the menu size, and I did not ask.

## What I would do differently
Write the non-goals first. Two of the questions I received were about things I
had already decided not to build, but never wrote down.
```

## Rules
- **Evidence must point at something**: a file, a section, a commit, a test name. "I did this well" is not evidence.
- *What I did not manage* is scored as honesty, not as failure. An empty one on an imperfect
  submission reads worse than a frank paragraph.
- The number in the file name must equal the total in this table. If they disagree, the table wins.
- A criterion claimed with no evidence line counts as claimed-and-not-done.

## Honesty adjustment (gap = your total − the mark)
| Gap | Adjustment |
|---|---|
| within ±10 | none — normal calibration |
| +11 to +20 | −3 |
| +21 to +30 | −6 |
| more than +30 | −10 |
| −21 or worse | −3 — read the rubric before you score yourself down |
| no SELF_ASSESSMENT_REPORT.md | −10, and the file-name total is ignored |

The adjustment never takes a submission below 0.
