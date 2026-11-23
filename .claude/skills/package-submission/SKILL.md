---
name: package-submission
description: Build the CSC13114 submission zip named <StudentID>_<total>.zip (group <ID1>-<ID2>-<ID3>_<total>.zip, IDs ascending) — verifies SELF_ASSESSMENT_REPORT.md exists and its total matches, required deliverables are present, AI-LOG.md is included, and no secrets/.env/node_modules get shipped. Use when the user says "zip it", "package", "ready to submit".
argument-hint: "[assignment folder]"
---
# Package a submission

1. Re-read the brief/rubric "How to submit" for this task: which files are required (e.g. IA#1 =
   spec.md, questions.md, spec-revised.md + SELF_ASSESSMENT_REPORT.md + AI-LOG.md), flat or folder,
   individual or group (ask for teammates' IDs if group).
2. Confirm the report and AI-LOG are current (offer `/self-assessment`, `/ai-log` if stale).
3. Dry run, then build (student ID default 23120018):
   ```bash
   python "<this skill dir>/scripts/package.py" "<folder>" --ids 23120018 \
       --files spec.md questions.md spec-revised.md AI-LOG.md SELF_ASSESSMENT_REPORT.md --dry-run
   ```
   Omit `--files` to zip the whole folder (skips node_modules, .git, .env*, build output, old zips).
   Add `--ids` once per member for group work — the script sorts them.
4. Fix every ERROR (don't bypass): mismatch between row sum and stated total, missing report,
   possible secrets. Surface WARNs to the user.
5. Remove/rename older zips with a different total in the folder so the wrong one isn't uploaded.
6. Report: zip path, name, file list. Uploading to Classroom is the user's job — never claim it's submitted.
