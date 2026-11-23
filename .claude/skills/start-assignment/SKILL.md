---
name: start-assignment
description: Kick off a new CSC13114 task (IA#, GA#, lab). Reads the brief, rubric and templates in the folder, maps every rubric criterion to a concrete deliverable, lists required files and deadline, and scaffolds AI-LOG.md. Use when the user drops a new assignment, says "new task/assignment/lab", or asks "what do I need to do for X".
argument-hint: "[folder, e.g. IA2 or GA1]"
---
# Start an assignment

Target folder: `$ARGUMENTS` (if empty, ask, or use the current directory if it contains a brief).

## 1. Read everything first
- The brief (task.md / description text), the **rubric PDF**, any templates (SELF_ASSESSMENT_REPORT
  template, AI-LOG template), slide decks (`.html` — extract text by stripping tags), and earlier
  submissions in sibling folders that this task builds on (e.g. IA1 spec → later implementation).
- If something referenced is missing (a slide, a template "on Classroom"), list it — ask the user to
  drop it in instead of guessing its content.

## 2. Produce `PLAN.md` in the folder (keep it to one screen)
```md
# <IA#n> — <title>
Deadline: <date> · Individual/Group · Weight: <x>% · Submit: <zip name pattern>

## Deliverables
- [ ] <file> — <what it must contain>
- [ ] AI-LOG.md
- [ ] SELF_ASSESSMENT_REPORT.md

## Rubric → how we hit the top band
| # | Criterion | Max | Top-band requirement (quote) | Our deliverable / evidence |

## Traps
- <anything in the brief that silently costs marks: file names, page limits, ID order, honesty gap>

## Open questions for the lecturer
```

## 3. Scaffold
- Create `AI-LOG.md` (header `# AI-LOG.md`) if missing — see the `ai-log` skill for format.
- Do not create the deliverables yet. Suggest the next skill: `/grill-me` to settle design decisions,
  `/feature-spec` for a spec, `/init-course-repo` for a new team repo.

## 4. Report
Tell the user, in ≤10 lines: what's due, the 2–3 criteria worth the most points, and the traps.
