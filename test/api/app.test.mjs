import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../../app/server.mjs';

async function usingApp(fn, options = {}) {
  const app = await startApp(options);
  const call = async (path, data, cookie, method = 'POST') => {
    const response = await fetch(app.url + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { response, body: response.status === 204 ? null : await response.json() };
  };
  try { await fn(call, app); } finally { await app.close(); }
}
const create = (call, username = 'u1', password = 'pw-0123456789abc') => call('/lab/users', { username, password });

// AC1: password sign-in creates a session readable via /api/me.
test('AC1 — password sign-in and session', () => usingApp(async (call) => {
  await create(call); const login = await call('/api/signin/password', { username: 'u1', password: 'pw-0123456789abc' });
  assert.equal(login.response.status, 200);
  const me = await call('/api/me', undefined, login.response.headers.get('set-cookie'), 'GET');
  assert.equal(me.response.status, 200); assert.deepEqual(me.body, { username: 'u1' });
}));
// AC2: wrong password fails.
test('AC2 — wrong password', () => usingApp(async (call) => { await create(call); const r = await call('/api/signin/password', { username: 'u1', password: 'wrong' }); assert.equal(r.response.status, 401); assert.equal(r.body.error, 'bad_credentials'); }));
// AC3: passkey-only accounts cannot sign in with a password.
test('AC3 — passkey-only account', () => usingApp(async (call) => { await create(call, 'p1', null); const r = await call('/api/signin/password', { username: 'p1', password: 'wrong' }); assert.equal(r.response.status, 401); assert.equal(r.body.error, 'bad_credentials'); }));
// AC4: unknown IDs are returned to the client.
test('AC4 — unknown credential', () => usingApp(async (call) => { const r = await call('/api/signin/passkey', { response: { id: 'unknown-id' } }); assert.equal(r.response.status, 400); assert.deepEqual(r.body, { error: 'unknown_credential', credentialId: 'unknown-id' }); }));
// AC5: a registration challenge is consumed even when verification fails.
test('AC5 — challenge cannot be reused', () => usingApp(async (call) => {
  await create(call); const session = await call('/lab/session', { username: 'u1' }); const cookie = session.response.headers.get('set-cookie');
  const options = await call('/api/register/options', {}, cookie);
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.body.challenge, origin: 'http://localhost' })).toString('base64url');
  const data = { response: { id: 'id', rawId: 'id', type: 'public-key', response: { clientDataJSON, attestationObject: 'AA' } } };
  await call('/api/register/verify', data, cookie); const r = await call('/api/register/verify', data, cookie); assert.equal(r.response.status, 400); assert.equal(r.body.error, 'bad_challenge');
}));
// AC6: registration requires a session.
test('AC6 — registration requires sign-in', () => usingApp(async (call) => { const r = await call('/api/register/options', {}); assert.equal(r.response.status, 401); assert.equal(r.body.error, 'not_signed_in'); }));
// AC7: usernames are unique.
test('AC7 — duplicate username', () => usingApp(async (call) => { await create(call); const r = await create(call); assert.equal(r.response.status, 409); assert.equal(r.body.error, 'username_taken'); }));
// AC8: deleting a missing credential returns not found.
test('AC8 — unknown credential deletion', () => usingApp(async (call) => { await create(call); const r = await call('/lab/users/u1/credentials/missing', undefined, undefined, 'DELETE'); assert.equal(r.response.status, 404); assert.equal(r.body.error, 'not_found'); }));
// AC9: the two HTML pages differ only in their lab configuration.
test('AC9 — arms differ only in config', async () => {
  const a = await startApp({ signal: false }); const b = await startApp({ signal: true });
  try { const html = await Promise.all([a, b].map(async (x) => (await fetch(`${x.url}/signin`)).text())); assert.notEqual(html[0], html[1]); assert.equal(html[0].replace(/^.*window\.labConfig.*$/m, ''), html[1].replace(/^.*window\.labConfig.*$/m, '')); } finally { await a.close(); await b.close(); }
});
