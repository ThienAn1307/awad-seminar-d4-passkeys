// Step model from docs/method.md section 5. One action = fill a field, one click,
// pick an autofill entry, or one UV gesture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSession } from '../../harness/model.mjs';

const typed = { usernameLength: 7, passwordLength: 16 };

test('valid passkey offered and accepted: 2 actions, first try succeeds', () => {
  const s = scoreSession({ autofill: 'credential', passkeyResult: 'ok', passwordResult: null, ...typed });
  assert.deepEqual(s, { actions: 2, keystrokes: 0, firstTry: true, success: true, failedAttempts: 0 });
});

test('stale passkey offered, rejected, then password: 5 actions, first try fails', () => {
  const s = scoreSession({ autofill: 'credential', passkeyResult: 'unknown_credential', passwordResult: 'ok', ...typed });
  assert.deepEqual(s, { actions: 5, keystrokes: 23, firstTry: false, success: true, failedAttempts: 1 });
});

test('nothing offered, password: 3 actions, first try succeeds', () => {
  const s = scoreSession({ autofill: 'none', passkeyResult: null, passwordResult: 'ok', ...typed });
  assert.deepEqual(s, { actions: 3, keystrokes: 23, firstTry: true, success: true, failedAttempts: 0 });
});

test('passkey-only account with nothing offered is locked out: no way to sign in', () => {
  const s = scoreSession({ autofill: 'none', passkeyResult: null, passwordResult: 'no_password', ...typed });
  assert.deepEqual(s, { actions: 0, keystrokes: 0, firstTry: false, success: false, failedAttempts: 0 });
});

test('conditional get that never settles is a harness error, not a data point', () => {
  assert.throws(
    () => scoreSession({ autofill: 'timeout', passkeyResult: null, passwordResult: null, ...typed }),
    /autofill did not settle/,
  );
});

test('an unexpected autofill error is a harness error, not a password session', () => {
  assert.throws(
    () => scoreSession({ autofill: 'error', passkeyResult: null, passwordResult: 'ok', ...typed }),
    /autofill failed/,
  );
});

test('a passkey result without an offered passkey is rejected as inconsistent', () => {
  assert.throws(
    () => scoreSession({ autofill: 'none', passkeyResult: 'ok', passwordResult: null, ...typed }),
    /inconsistent/,
  );
});
