import express from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateAuthenticationOptions, verifyAuthenticationResponse, generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';

const rpID = 'localhost';
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const browserDir = fileURLToPath(new URL('../node_modules/@simplewebauthn/browser/dist/bundle/', import.meta.url));
const random = (bytes = 16) => randomBytes(bytes).toString('base64url');

export async function startApp({ signal = false, acceptedList = 'off', port = 0 } = {}) {
  if (!['off', 'correct', 'incomplete'].includes(acceptedList)) throw new Error('Invalid acceptedList');
  const app = express();
  const users = new Map();
  const sessions = new Map();
  const challenges = new Map();
  let origin;
  app.use(express.json());
  app.use('/public', express.static(publicDir));
  app.use('/webauthn', express.static(browserDir));
  const userFor = (req) => users.get(sessions.get((req.headers.cookie ?? '').split('; ').find((s) => s.startsWith('sid='))?.slice(4)));
  const signedIn = (res, username) => { const token = random(32); sessions.set(token, username); res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/`); };
  const replyUser = (user) => ({ username: user.username, userId: user.userId, ...(acceptedList === 'off' ? {} : { acceptedCredentialIds: user.credentials.slice(acceptedList === 'incomplete' ? 1 : 0).map((c) => c.id) }) });
  const remember = (challenge, type, username = null) => challenges.set(challenge, { type, username, expires: Date.now() + 60_000 });
  function consume(response, type, username = null) {
    try {
      const value = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString()).challenge;
      const entry = challenges.get(value); challenges.delete(value);
      return entry && entry.type === type && entry.username === username && entry.expires >= Date.now() ? value : null;
    } catch { return null; }
  }
  const requireUser = (req, res, next) => { req.user = userFor(req); if (!req.user) return res.status(401).json({ error: 'not_signed_in' }); next(); };
  app.get('/signin', (_req, res) => res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Đăng nhập</title></head><body data-state="waiting">
<script>window.labConfig = ${JSON.stringify({ signal, acceptedList })}</script>
<form id="form"><label>Tên đăng nhập <input id="username" autocomplete="username webauthn"></label><label>Mật khẩu <input id="password" type="password" autocomplete="current-password"></label><button id="submit">Đăng nhập</button></form><p id="message"></p><script src="/webauthn/index.umd.min.js"></script><script type="module" src="/public/signin.js"></script></body></html>`));
  app.get('/account', (req, res) => res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tài khoản</title></head><body data-state="${userFor(req) ? 'ready' : 'error'}"><p id="message"></p><script src="/webauthn/index.umd.min.js"></script><script type="module" src="/public/account.js"></script></body></html>`));
  app.post('/lab/users', (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || !username || !(typeof password === 'string' || password === null)) return res.status(400).json({ error: 'invalid_input' });
    if (users.has(username)) return res.status(409).json({ error: 'username_taken' });
    const salt = random(); const passwordHash = password === null ? null : scryptSync(password, salt, 32);
    const user = { username, userId: random(), salt, passwordHash, credentials: [] }; users.set(username, user); res.status(201).json({ userId: user.userId });
  });
  app.post('/lab/session', (req, res) => { const user = users.get(req.body?.username); if (!user) return res.status(404).json({ error: 'not_found' }); signedIn(res, user.username); res.sendStatus(204); });
  app.get('/lab/users/:username', (req, res) => { const user = users.get(req.params.username); if (!user) return res.status(404).json({ error: 'not_found' }); res.json({ userId: user.userId, hasPassword: user.passwordHash !== null, credentialIds: user.credentials.map((c) => c.id) }); });
  app.delete('/lab/users/:username/credentials/:credentialId', (req, res) => { const user = users.get(req.params.username); const i = user?.credentials.findIndex((c) => c.id === req.params.credentialId) ?? -1; if (i < 0) return res.status(404).json({ error: 'not_found' }); user.credentials.splice(i, 1); res.sendStatus(204); });
  app.post('/api/signin/password', (req, res) => { const user = users.get(req.body?.username); const password = req.body?.password; if (!user?.passwordHash || typeof password !== 'string' || !timingSafeEqual(user.passwordHash, scryptSync(password, user.salt, 32))) return res.status(401).json({ error: 'bad_credentials' }); signedIn(res, user.username); res.json(replyUser(user)); });
  app.post('/api/signout', (req, res) => { const token = (req.headers.cookie ?? '').split('; ').find((s) => s.startsWith('sid='))?.slice(4); sessions.delete(token); res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.sendStatus(204); });
  app.get('/api/me', requireUser, (req, res) => res.json({ username: req.user.username }));
  app.post('/api/signin/options', async (_req, res) => { const options = await generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: 'required', timeout: 5000 }); remember(options.challenge, 'signin'); res.json(options); });
  app.post('/api/signin/passkey', async (req, res) => {
    const response = req.body?.response; const credentialId = response?.id;
    const user = [...users.values()].find((u) => u.credentials.some((c) => c.id === credentialId));
    if (!user) { consume(response, 'signin'); return res.status(400).json({ error: 'unknown_credential', credentialId }); }
    const challenge = consume(response, 'signin'); if (!challenge) return res.status(400).json({ error: 'bad_challenge' });
    const credential = user.credentials.find((c) => c.id === credentialId);
    try { const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, credential, requireUserVerification: true }); if (!result.verified) throw new Error('Verification failed'); credential.counter = result.authenticationInfo.newCounter; signedIn(res, user.username); res.json(replyUser(user)); } catch { res.status(400).json({ error: 'verification_failed' }); }
  });
  app.post('/api/register/options', requireUser, async (req, res) => { const user = req.user; const options = await generateRegistrationOptions({ rpName: 'Passkey lab', rpID, userName: user.username, userID: Buffer.from(user.userId, 'base64url'), timeout: 5000, attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: user.credentials.map(({ id, transports }) => ({ id, transports })) }); remember(options.challenge, 'register', user.username); res.json(options); });
  app.post('/api/register/verify', requireUser, async (req, res) => { const response = req.body?.response; const challenge = consume(response, 'register', req.user.username); if (!challenge) return res.status(400).json({ error: 'bad_challenge' }); try { const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }); if (!result.verified) throw new Error('Verification failed'); req.user.credentials.push(result.registrationInfo.credential); res.status(201).json({ credentialId: result.registrationInfo.credential.id }); } catch { res.status(400).json({ error: 'verification_failed' }); } });
  const server = await new Promise((resolve, reject) => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  origin = `http://localhost:${server.address().port}`;
  return { url: origin, close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())) };
}
