---
name: ai-log
description: Append an honest entry to AI-LOG.md in the CSC13114 format (Tool / Asked for / Kept / Changed / Rejected / By hand) describing what the assistant did in this session. Use after any AI-assisted step, at the end of a work session, when the user says "log this", "update the AI log", or before packaging a submission.
argument-hint: "[folder with AI-LOG.md]"
---
# AI-LOG entry

Every submission includes AI-LOG.md. It is an account, not a transcript — but it is evidence at the
oral. Full course template: [references/AI-LOG-TEMPLATE.md](references/AI-LOG-TEMPLATE.md).

## Format (exact)
```md
## <YYYY-MM-DD> — <what was worked on> (<IA#n / GA#n>)
Tool: Claude Code.
Asked for: <the task, one sentence>
Kept: <what was taken as-is>
Changed: <what was rewritten, and why>
Rejected: <what was thrown away, and why>
By hand: <the parts the student did themselves>
```
Omit a line only if truly empty (e.g. nothing rejected) — never pad.

## How to write it
1. Find `AI-LOG.md` in the assignment folder or repo root (create with `# AI-LOG.md` header if missing).
   Read existing entries — don't duplicate; one entry per distinct task/decision.
2. Reconstruct from **this conversation**: what the user asked, what I produced, what they accepted,
   what they pushed back on or overrode, what alternatives were discarded and why.
3. **By hand / Rejected must be the user's truth.** I can't know what they did outside this chat.
   Draft these from what I observed (decisions the user made, options they picked, bugs they spotted),
   then ask the user to confirm or edit before saving. Never claim the student wrote something they didn't,
   and never under-report AI use — declaring heavy use costs nothing; vagueness does.
4. Be specific and checkable: name files, endpoints, ACs, the bug that was caught.
   Bad: "Used AI for the frontend. Fixed some things."
5. Use today's real date. Append at the end, chronological order.
