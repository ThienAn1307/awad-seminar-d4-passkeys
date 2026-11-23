// The declared step model (docs/method.md section 5). The harness cannot see the
// autofill UI, so actions are counted from what it observes, not measured.
//
// obs.autofill:       'credential' (conditional get resolved), 'none' (it rejected with
//                     NotAllowedError), 'error' (any other error) or 'timeout' (it never
//                     settled); the last two are harness errors, not data points
// obs.passkeyResult:  'ok' | 'unknown_credential' | null (no passkey was tried)
// obs.passwordResult: 'ok' | 'no_password' (passkey-only account) | null (not needed)

const PICK_AND_UV = 2; // pick the autofill entry, one UV gesture
const PASSWORD_PATH = 3; // fill username, fill password, click submit

export function scoreSession(obs) {
  if (obs.autofill === 'timeout') throw new Error('autofill did not settle within the timeout');
  if (obs.autofill !== 'credential' && obs.autofill !== 'none') throw new Error(`autofill failed: ${obs.autofill}`);
  if (obs.autofill !== 'credential' && obs.passkeyResult !== null) {
    throw new Error(`inconsistent session: passkeyResult ${obs.passkeyResult} without an offered passkey`);
  }

  let actions = 0;
  let keystrokes = 0;
  let failedAttempts = 0;

  if (obs.autofill === 'credential') {
    actions += PICK_AND_UV;
    if (obs.passkeyResult === 'ok') {
      return { actions, keystrokes, firstTry: true, success: true, failedAttempts };
    }
    failedAttempts += 1;
  }

  const firstTry = failedAttempts === 0;
  if (obs.passwordResult === 'no_password') {
    // Nothing left to try: a lockout. Recovery is out of scope (method.md section 8).
    return { actions, keystrokes, firstTry: false, success: false, failedAttempts };
  }

  actions += PASSWORD_PATH;
  keystrokes += obs.usernameLength + obs.passwordLength;
  const success = obs.passwordResult === 'ok';
  return { actions, keystrokes, firstTry: firstTry && success, success, failedAttempts };
}
