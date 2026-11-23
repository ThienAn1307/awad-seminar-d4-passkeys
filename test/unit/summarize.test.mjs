// Metrics and spread from docs/method.md sections 6 and 9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spread, runMetrics, summarize, probeMetrics } from '../../harness/summarize.mjs';

// One session row per user per session, as measure.mjs writes them.
function row(cohort, user, session, actions, firstTry, success = true) {
  return { cohort, user, session, actions, keystrokes: actions > 2 ? 23 : 0, firstTry, success, failedAttempts: firstTry ? 0 : 1 };
}

// A stale user under the change arm: fails once in session 1, then the password path.
function staleChangeRows(user) {
  return [row('stale', user, 1, 5, false), ...[2, 3, 4, 5].map((s) => row('stale', user, s, 3, true))];
}

test('spread of identical values reports them as identical', () => {
  assert.deepEqual(spread([3, 3, 3, 3, 3]), { median: 3, min: 3, max: 3, n: 5, identical: true });
});

test('spread takes the middle of two values for an even count', () => {
  assert.deepEqual(spread([4, 1, 3, 2]), { median: 2.5, min: 1, max: 4, n: 4, identical: false });
});

test('headline uses sessions 2 to 5 only, so session 1 does not dilute it', () => {
  const m = runMetrics([...staleChangeRows('stale01'), ...staleChangeRows('stale02')]);
  assert.deepEqual(m.headline, { firstTryPct: 100, actionsPerSignin: 3, signins: 8 });
});

test('per-session table keeps session 1 visible', () => {
  const m = runMetrics(staleChangeRows('stale01'));
  assert.deepEqual(m.bySession.stale[1], { firstTryPct: 0, actionsPerSignin: 5, keystrokesPerSignin: 23, successPct: 100, signins: 1 });
});

test('overall success is reported per cohort so a lockout shows up', () => {
  const rows = [row('valid', 'valid01', 1, 2, true), row('valid', 'valid02', 1, 0, false, false)];
  assert.equal(runMetrics(rows).successPctByCohort.valid, 50);
});

test('runs marked as errors are kept out of the median', () => {
  const ok = (run) => ({ run, arm: 'change', status: 'ok', rows: staleChangeRows('stale01') });
  const runs = [ok(1), ok(2), ok(3), ok(4), ok(5), { run: 6, arm: 'change', status: 'error', rows: [] }];
  const s = summarize(runs, { minRuns: 5 });
  assert.equal(s.arms.change.validRuns, 5);
  assert.equal(s.arms.change.errorRuns, 1);
  assert.deepEqual(s.arms.change.headline.firstTryPct, { median: 100, min: 100, max: 100, n: 5, identical: true });
});

test('fewer valid runs than required is flagged', () => {
  const runs = [{ run: 1, arm: 'baseline', status: 'ok', rows: staleChangeRows('stale01') }];
  assert.equal(summarize(runs, { minRuns: 5 }).enoughRuns, false);
});

// Probe (method.md section 8): rows carry passkeyKept, whether the user's own valid
// passkey is still on the authenticator after the session.
function probeRows(user, { kept, lockedOut }) {
  const first = { ...row('valid', user, 1, 2, true), passkeyKept: kept };
  const later = [2, 3, 4, 5].map((s) => (lockedOut
    ? { ...row('valid', user, s, 0, false, false), passkeyKept: kept }
    : { ...row('valid', user, s, kept ? 2 : 3, true), passkeyKept: kept }));
  return [first, ...later];
}

test('probe: an incomplete list on passkey-only accounts deletes the passkey and locks users out', () => {
  const m = probeMetrics([...probeRows('a', { kept: false, lockedOut: true }), ...probeRows('b', { kept: false, lockedOut: true })]);
  assert.deepEqual(m, { passkeyDeletedPct: 100, lockoutPct: 100, firstTryPct: 0, actionsPerSignin: 0, users: 2 });
});

test('probe: a correct list keeps the passkey and changes nothing', () => {
  const m = probeMetrics(probeRows('a', { kept: true, lockedOut: false }));
  assert.deepEqual(m, { passkeyDeletedPct: 0, lockoutPct: 0, firstTryPct: 100, actionsPerSignin: 2, users: 1 });
});

test('probe: with a password left, a deleted passkey costs a step but no lockout', () => {
  const m = probeMetrics(probeRows('a', { kept: false, lockedOut: false }));
  assert.deepEqual(m, { passkeyDeletedPct: 100, lockoutPct: 0, firstTryPct: 100, actionsPerSignin: 3, users: 1 });
});
