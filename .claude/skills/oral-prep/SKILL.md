---
name: oral-prep
description: Prepare the student to defend their own submission at the CSC13114 oral/demo — walks through the code and decisions (especially AI-written parts), then quizzes them one question at a time like the lecturer would. Use before an oral, demo, checkpoint review, or when the user says "quiz me", "can I explain this", "prepare me for the defense".
argument-hint: "[folder or files to defend]"
---
# Oral defense prep

Course rule: *"You will be asked. Anything you cannot explain scores zero, even if it runs."*
The goal is the student's understanding, not mine — don't lecture, make them answer.

1. **Scope**: read the deliverables + AI-LOG.md. AI-LOG entries tell you which parts the assistant
   wrote — those are the highest-risk areas. Build a list of 8–15 defense targets: key decisions in the
   spec/design, non-obvious code paths (auth, payment callbacks, concurrency/idempotency, DB
   transactions, Socket.IO events), each "Rejected"/"Changed" line in the log, and every
   assumption/limitation.
2. **Quick map** (≤15 lines): the architecture and the 3 things the lecturer is most likely to ask.
3. **Quiz, one question at a time.** Mix: "why this and not X?", "what happens if two requests arrive
   at once?", "point to the line that enforces …", "what breaks if we remove …", "why is AC9 testable?".
   Wait for the answer. Then: correct / partly / wrong + the 1–3 sentence explanation + the file:line.
4. Track a scoreboard. Re-ask missed topics later in different words.
5. End with: topics solid, topics to review (with file:line), and any code the student still can't
   explain → recommend simplifying or rewriting it by hand before the oral, and logging that in AI-LOG.
