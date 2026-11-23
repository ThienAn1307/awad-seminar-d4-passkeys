# awad-seminar-d4-passkeys: CSC13114 SEMINAR, topic D4

A measured study: does `PublicKeyCredential.signalUnknownCredential()` stop the browser offering a passkey the server has deleted, and what does that do to sign-in success and steps?
Team: 23120018 Nguyễn Ngọc Thiên Ân (harness, results, README, CI, packaging); 23120031 Nguyễn Phú Dinh (facts, sources, slides, manual GPM run); 23120040 Hồ Hữu Hoàng Hải (app).

## Read first
- `docs/method.md`: the question, baseline vs change, cohorts, step model, metrics, predictions. It was written before the code. If code must differ from it, change method.md in its own commit and say why.
- `spike/README.md`: what Chromium's CDP virtual authenticator actually does (2026-11-21). The facts in method.md rest on it.

## Stack (decided)
- App: Node 24, Express, `@simplewebauthn/server` 14.1.0 and `@simplewebauthn/browser` 14.0.0, in-memory data, bind 127.0.0.1, rpId `localhost`.
- Harness: Playwright 1.65.1 pinned exactly, Chrome for Testing 159 (`channel: 'chromium'`, new headless), CDP `WebAuthn` virtual authenticator.
- Never use the headless shell or Playwright's `context.credentials` shim: both behave unlike Chrome (see spike).

## Commands (planned; fill in as they land)
- Install: `npm ci`, then `npx playwright install chromium`
- Measure: `npm run measure` writes `results/<timestamp>/` (env.json, raw JSONL per run, summary.json)
- Conditional create evidence: `npm run check:conditional-create`
- Test and lint: `npm test`, `npm run lint`

## Rules (course and team)
- Baseline and change differ only by the `SIGNAL` flag. Any other difference breaks the study.
- Every number in REPORT.md or the slides must be copied from a file in `results/`.
- Only our own systems: localhost rpId, no third-party sites; the harness blocks and logs any external request.
- Every teammate must be able to explain any line at the talk or an oral; prefer simple code.
- AI-LOG.md and SELF_ASSESSMENT_REPORT.md stay local (listed in `.git/info/exclude`); they go only into the submission zip.
- No secrets anywhere; this study needs none. Never read `.env` files.
- Write deliverables in Vietnamese; keep API names, errors and quotes in English. No "·" separators; write "section 1", not "§1".
