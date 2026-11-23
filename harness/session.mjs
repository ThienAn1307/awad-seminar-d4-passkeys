// One sign-in session (docs/method.md section 5, docs/app-contract.md "Luồng").
// The harness acts as the user only on the password path; the passkey path settles by
// itself because the virtual authenticator answers the conditional get.
import { scoreSession } from './model.mjs';

export const WEBAUTHN_TIMEOUT_MS = 5000;
const SETTLE_MARGIN_MS = 1000;

const state = (page) => page.evaluate(() => document.body.dataset.state);

// Waits until <body data-state> is set and is none of `states`, or a password was refused.
async function waitForStateOtherThan(page, states) {
  await page.waitForFunction(
    (s) => {
      const v = document.body.dataset.state;
      return (v !== undefined && !s.includes(v)) || window.lab?.passwordResult === 'bad_credentials';
    },
    states,
    { timeout: WEBAUTHN_TIMEOUT_MS + SETTLE_MARGIN_MS },
  );
}

export async function runSession({ page, auth, baseUrl, user }) {
  const credentialsBefore = await auth.credentialIds();
  const t0 = Date.now();
  await page.goto(`${baseUrl}/signin`);

  let autofill;
  try {
    await waitForStateOtherThan(page, ['waiting']);
  } catch {
    autofill = 'timeout';
  }

  let passwordResult = null;
  const lab = autofill ? {} : await page.evaluate(() => ({ ...window.lab }));
  if (!autofill && (await state(page)) === 'password') {
    if (user.password === null) {
      passwordResult = 'no_password'; // passkey-only account: nothing left to try
    } else {
      await page.fill('#username', user.username);
      await page.fill('#password', user.password);
      await page.click('#submit');
      await waitForStateOtherThan(page, ['password']);
      passwordResult = (await page.evaluate(() => window.lab.passwordResult)) ?? null;
    }
  }
  const finalState = autofill ? 'timeout' : await state(page);
  const final = autofill ? {} : await page.evaluate(() => ({ ...window.lab }));
  const ms = Date.now() - t0;

  const scored = scoreSession({
    autofill: autofill ?? lab.autofill,
    passkeyResult: lab.passkeyResult ?? null,
    passwordResult,
    usernameLength: user.username.length,
    passwordLength: user.password?.length ?? 0,
  });
  if (scored.success !== (finalState === 'signed-in')) {
    throw new Error(`model says success=${scored.success} but the page ended in state ${finalState}`);
  }

  await page.request.post(`${baseUrl}/api/signout`);
  const credentialsAfter = await auth.credentialIds();
  return {
    ...scored,
    autofill: lab.autofill,
    errorName: lab.errorName ?? null,
    passkeyResult: lab.passkeyResult ?? null,
    passwordResult,
    signalled: final.signalled ?? [],
    signalError: final.signalError ?? null,
    finalState,
    credentialsBefore,
    credentialsAfter,
    passkeyKept: user.credentialId ? credentialsAfter.includes(user.credentialId) : null,
    ms,
  };
}
