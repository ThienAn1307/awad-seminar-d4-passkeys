// AC10 to AC15 of docs/app-contract.md: the app and the harness together, in Chrome for
// Testing with a CDP virtual authenticator. Needs app/server.mjs (Hải) to exist.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../../app/server.mjs';
import { launchBrowser } from '../../harness/browser.mjs';
import { enrollUser, labUser } from '../../harness/setup.mjs';
import { runSession } from '../../harness/session.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function withApp(options, fn) {
  const app = await startApp({ port: 0, ...options });
  try {
    return await fn(app.url);
  } finally {
    await app.close();
  }
}

for (const signal of [false, true]) {
  test(`AC10 valid passkey signs in from autofill (signal ${signal})`, () => withApp({ signal }, async (baseUrl) => {
    const u = await enrollUser({ browser, baseUrl, username: 'valid01', password: 'pw-0123456789abc', passkey: 'valid' });
    const s = await runSession({ ...u, baseUrl });
    assert.equal(s.autofill, 'credential');
    assert.equal(s.passkeyResult, 'ok');
    assert.equal(s.success, true);
    assert.equal(s.actions, 2);
    await u.context.close();
  }));
}

test('AC11 stale passkey without the signal: offered again in session 2, still on the authenticator', () => withApp({ signal: false }, async (baseUrl) => {
  const u = await enrollUser({ browser, baseUrl, username: 'stale01', password: 'pw-0123456789abc', passkey: 'stale' });
  const s1 = await runSession({ ...u, baseUrl });
  const s2 = await runSession({ ...u, baseUrl });
  for (const s of [s1, s2]) {
    assert.equal(s.passkeyResult, 'unknown_credential');
    assert.equal(s.success, true);
    assert.equal(s.actions, 5);
  }
  assert.equal((await u.auth.credentialIds()).length, 1);
  await u.context.close();
}));

test('AC12 stale passkey with the signal: removed after session 1, not offered in session 2', () => withApp({ signal: true }, async (baseUrl) => {
  const u = await enrollUser({ browser, baseUrl, username: 'stale01', password: 'pw-0123456789abc', passkey: 'stale' });
  const s1 = await runSession({ ...u, baseUrl });
  assert.deepEqual(s1.signalled, ['unknownCredential']);
  assert.deepEqual(s1.credentialsAfter, []);
  const s2 = await runSession({ ...u, baseUrl });
  assert.equal(s2.autofill, 'none');
  assert.equal(s2.actions, 3);
  assert.equal(s2.firstTry, true);
  await u.context.close();
}));

test('AC13 a browser without signalUnknownCredential still falls back to the password', () => withApp({ signal: true }, async (baseUrl) => {
  const u = await enrollUser({ browser, baseUrl, username: 'stale01', password: 'pw-0123456789abc', passkey: 'stale' });
  await u.context.addInitScript(() => { delete PublicKeyCredential.signalUnknownCredential; });
  const s = await runSession({ ...u, baseUrl });
  assert.notEqual(s.signalError, null);
  assert.equal(s.success, true);
  await u.context.close();
}));

for (const [acceptedList, expectedLeft] of [['incomplete', 0], ['correct', 1]]) {
  test(`AC14 probe: accepted list ${acceptedList} leaves ${expectedLeft} passkey on the laptop`, () => withApp({ signal: true, acceptedList }, async (baseUrl) => {
    const u = await enrollUser({ browser, baseUrl, username: 'probe01', password: null, passkey: 'valid', secondDevice: true });
    await runSession({ ...u, baseUrl });
    assert.equal((await u.auth.credentialIds()).length, expectedLeft);
    await u.context.close();
  }));
}

test('AC15 the server and the authenticator agree on the credential id after enrolment', () => withApp({}, async (baseUrl) => {
  const u = await enrollUser({ browser, baseUrl, username: 'valid01', password: 'pw-0123456789abc', passkey: 'valid' });
  const server = await labUser(u.page, baseUrl, 'valid01');
  assert.deepEqual(server.credentialIds, await u.auth.credentialIds());
  await u.context.close();
}));
