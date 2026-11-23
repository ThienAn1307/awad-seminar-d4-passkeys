// Empirical spike: what Chromium does under Playwright automation for
// WebAuthn conditional create, Signal API, conditional get, getClientCapabilities,
// and the Digital Credentials API (virtual wallet).
//
// Usage:  node run-spike.mjs                 (everything, all configs, 2 runs)
//         node run-spike.mjs --only A,D --configs cft --runs 1
//
// Safety: launches its own browsers (fresh temp profiles via Playwright, or a temp
// --user-data-dir for the protocol-JSON step), serves its own page on localhost,
// never connects to an existing Chrome, never kills processes it did not start.
// Every credential/user ID passed to the Signal API is created by this script.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const LOGFILE = path.join(OUT, `log-${STAMP}.txt`);
const JSONFILE = path.join(OUT, `results-${STAMP}.json`);

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', 'P,A,B,C,D,E,F,G,H').split(',');
const RUNS = Number(arg('--runs', '2'));
const PENDING_MS = Number(arg('--pending-ms', '15000'));
const CHROME_STABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHELL_EXE = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe');

const ALL_CONFIGS = [
  // Playwright default for headless:true is chromium-headless-shell (no //chrome layer).
  { name: 'shell', label: 'Playwright chromium-headless-shell (headless:true)', launch: { headless: true }, exe: SHELL_EXE },
  // channel 'chromium' = full Chrome for Testing build in new headless mode.
  { name: 'cft', label: 'Playwright Chromium / Chrome for Testing (channel chromium, new headless)', launch: { headless: true, channel: 'chromium' }, exe: chromium.executablePath() },
  { name: 'chrome', label: 'Google Chrome stable (channel chrome, new headless)', launch: { headless: true, channel: 'chrome' }, exe: CHROME_STABLE, optional: true },
  // Headed full Chromium, only for the UI-sensitive tests (A, E), only when asked.
  { name: 'cft-headed', label: 'Playwright Chromium headed (channel chromium, headless:false)', launch: { headless: false, channel: 'chromium' }, exe: chromium.executablePath(), onlyTests: ['A', 'E', 'D'], explicit: true },
];
const CFG_SEL = arg('--configs', 'shell,cft,chrome,cft-headed').split(',');
const CONFIGS = ALL_CONFIGS.filter(c => CFG_SEL.includes(c.name) && (!c.optional || fs.existsSync(c.exe)));

const AUTH_OPTS = { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };

const lines = [];
const results = [];
function log(...a) {
  const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  console.log(s); lines.push(s); fs.appendFileSync(LOGFILE, s + '\n');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = (n = 16) => randomBytes(n).toString('base64url');
const b64ToB64u = s => Buffer.from(s, 'base64').toString('base64url');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function short(r) {
  if (!r) return r;
  const o = { state: r.state, ms: r.ms };
  if (r.name) { o.name = r.name; o.message = r.message; }
  if (r.value !== undefined) o.value = r.value;
  if (r.afterAbort) o.afterAbort = { state: r.afterAbort.state, ms: r.afterAbort.ms, name: r.afterAbort.name, message: r.afterAbort.message };
  if (r.stage) o.stage = r.stage;
  return o;
}

function record(env, test, variant, data) {
  const row = { config: env.cfg.name, run: env.run, test, variant, ...data };
  results.push(row);
  log(`[${env.cfg.name} r${env.run}] ${test} ${variant} =>`, data);
}

// ---------- page / CDP helpers ----------
async function newPage(env, { cdp = true, enableUI = false, withAuth = true, authOpts = AUTH_OPTS, webauthn = true } = {}) {
  const context = await env.browser.newContext();
  const page = await context.newPage();
  const events = [];
  let client = null, authenticatorId = null, enableErr = null, addErr = null;
  if (cdp) {
    client = await context.newCDPSession(page);
    for (const ev of ['credentialAdded', 'credentialDeleted', 'credentialUpdated', 'credentialAsserted']) {
      client.on('WebAuthn.' + ev, p => events.push({
        t: Date.now(), ev,
        credentialId: p.credential ? b64ToB64u(p.credential.credentialId) : (p.credentialId ? b64ToB64u(p.credentialId) : undefined),
        userName: p.credential?.userName, userDisplayName: p.credential?.userDisplayName,
      }));
    }
    if (webauthn) {
      try { await client.send('WebAuthn.enable', enableUI ? { enableUI: true } : {}); }
      catch (e) { enableErr = e.message; }
    }
    if (withAuth) {
      try { ({ authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', { options: authOpts })); }
      catch (e) { addErr = e.message; }
    }
  }
  await page.goto(env.base + '/');
  const getCreds = async () => {
    if (!client || !authenticatorId) return null;
    const { credentials } = await client.send('WebAuthn.getCredentials', { authenticatorId });
    return credentials.map(c => ({ id: b64ToB64u(c.credentialId), rk: c.isResidentCredential, rpId: c.rpId, userHandle: c.userHandle ? b64ToB64u(c.userHandle) : null, signCount: c.signCount, BE: c.backupEligibility, BS: c.backupState, userName: c.userName, userDisplayName: c.userDisplayName }));
  };
  return { context, page, client, authenticatorId, events, enableErr, addErr, getCreds, close: () => context.close() };
}

// Queue fn (serialised, runs in page) and click #go so it runs inside a click handler.
async function clickAndRun(page, id, fn, a, timeoutMs = PENDING_MS) {
  await page.evaluate(([id, src, a]) => { window.__pending = { id, f: (0, eval)('(' + src + ')'), arg: a }; }, [id, fn.toString(), a]);
  await page.click('#go');
  return waitResult(page, id, timeoutMs);
}
// Same, but started from page.evaluate (no user activation).
async function runNoClick(page, id, fn, a) {
  await page.evaluate(([id, src, a]) => { window.__start({ id, f: (0, eval)('(' + src + ')'), arg: a }); }, [id, fn.toString(), a]);
}
async function waitResult(page, id, timeoutMs = PENDING_MS) {
  try { await page.waitForFunction(id => window.__res[id] && window.__res[id].state !== 'pending', id, { timeout: timeoutMs, polling: 50 }); } catch {}
  const r = await page.evaluate(id => window.__res[id], id);
  if (r && r.state === 'pending') {
    r.state = `pending after ${timeoutMs / 1000} s`;
    const aborted = await page.evaluate(() => { if (window.__ac) { window.__ac.abort(); return true; } return false; });
    if (aborted) {
      try { await page.waitForFunction(id => window.__res[id] && window.__res[id].state !== 'pending', id, { timeout: 3000, polling: 50 }); } catch {}
      r.afterAbort = await page.evaluate(id => window.__res[id], id);
    }
  }
  return r;
}

// In-page functions (serialised with toString, so they only use page globals h/navigator).
const fCreate = async ({ userId, name, displayName, mediation, timeout, rk }) => {
  const ac = new AbortController(); window.__ac = ac;
  const o = { ...h.createOpts({ userId, name, displayName, rk }), signal: ac.signal };
  if (mediation) o.mediation = mediation;
  if (timeout) o.publicKey.timeout = timeout;
  return h.serCred(await navigator.credentials.create(o));
};
const fGet = async ({ allow = [], mediation } = {}) => {
  const ac = new AbortController(); window.__ac = ac;
  const o = { ...h.getOpts({ allow }), signal: ac.signal };
  if (mediation) o.mediation = mediation;
  return h.serCred(await navigator.credentials.get(o));
};

async function modalCreate(P, env, label, userId, name) {
  const r = await clickAndRun(P.page, `${label}-${rid(4)}`, fCreate, { userId, name, displayName: name });
  return r;
}
async function modalGet(P, label, allow = []) {
  return clickAndRun(P.page, `${label}-${rid(4)}`, fGet, { allow });
}

// ---------- Tests ----------
async function testA(env) {
  const variants = [
    { v: 'A1 load-then-click, enableUI default', enableUI: false, withAuth: true, prelogin: false },
    { v: 'A1t load-then-click, enableUI default, publicKey.timeout=5000', enableUI: false, withAuth: true, prelogin: false, timeout: 5000 },
    { v: 'A1u load-then-click, enableUI default, authenticator transport usb', enableUI: false, withAuth: true, prelogin: false, authOpts: { ...AUTH_OPTS, transport: 'usb' } },
    { v: 'A1 load-then-click, enableUI:true', enableUI: true, withAuth: true, prelogin: false },
    { v: 'A2 after password form submit, enableUI default', enableUI: false, withAuth: true, prelogin: true },
    { v: 'A2 after password form submit, enableUI:true', enableUI: true, withAuth: true, prelogin: true },
    { v: 'A3a no CDP at all (real environment)', cdp: false, withAuth: false, prelogin: true },
    { v: 'A3b WebAuthn.enable but no authenticator', enableUI: false, withAuth: false, prelogin: true },
    { v: 'A3c WebAuthn.enable{enableUI:true} but no authenticator', enableUI: true, withAuth: false, prelogin: true },
  ];
  for (const V of variants) {
    const P = await newPage(env, { cdp: V.cdp !== false, enableUI: V.enableUI, withAuth: V.withAuth, authOpts: V.authOpts });
    const user = 'alice@example.test';
    if (V.prelogin) {
      await P.page.fill('#username', user);
      await P.page.fill('#password', 'not-a-real-password-123');
      await Promise.all([P.page.waitForURL(/\/welcome/), P.page.click('#signin')]);
    }
    const userId = rid();
    const r = await clickAndRun(P.page, 'A', fCreate, { userId, name: user, displayName: 'Alice', mediation: 'conditional', timeout: V.timeout });
    await sleep(200);
    const creds = await P.getCreds();
    record(env, 'A', V.v, { enableErr: P.enableErr, addErr: P.addErr, url: P.page.url().replace(env.base, ''), result: short(r), credsOnAuthenticator: creds, cdpEvents: P.events.map(e => e.ev) });
    await P.close();
  }
  // A4: Playwright's own context.credentials shim (no CDP), conditional and modal create.
  {
    const context = await env.browser.newContext();
    let installErr = null;
    try { await context.credentials.install(); } catch (e) { installErr = e.message.split('\n')[0]; }
    const page = await context.newPage();
    await page.goto(env.base + '/');
    const rc = await clickAndRun(page, 'A4c', fCreate, { userId: rid(), name: 'alice@example.test', displayName: 'Alice', mediation: 'conditional' });
    const rm = await clickAndRun(page, 'A4m', fCreate, { userId: rid(), name: 'alice2@example.test', displayName: 'Alice2' });
    let stored = null; try { stored = (await context.credentials.get({ rpId: 'localhost' })).map(c => c.id); } catch (e) { stored = 'ERR ' + e.message.split('\n')[0]; }
    record(env, 'A', 'A4 Playwright context.credentials.install() shim, no CDP', { installErr, conditional: short(rc), modal: short(rm), shimStoredIds: stored });
    await context.close();
  }
}

async function testB(env) {
  for (const enableUI of [false, true]) {
    const P = await newPage(env, { enableUI });
    const r = await modalCreate(P, env, 'B', rid(), 'bob@example.test');
    await sleep(200);
    record(env, 'B', `modal create, enableUI:${enableUI}`, { enableErr: P.enableErr, result: short(r), credsOnAuthenticator: await P.getCreds(), cdpEvents: P.events.map(e => e.ev) });
    await P.close();
  }
}

async function testC(env) {
  const P = await newPage(env, { enableUI: false });
  const sig = (fnName, a) => clickAndRun(P.page, `C-${fnName}-${rid(4)}`, async ({ fnName, a }) => {
    if (typeof PublicKeyCredential[fnName] !== 'function') throw new Error(fnName + ' not a function');
    const v = await PublicKeyCredential[fnName](a); return v === undefined ? 'undefined' : v;
  }, { fnName, a }, 5000);
  const evCount = () => P.events.length;

  // C1 signalUnknownCredential
  const u1 = rid();
  const c1 = await modalCreate(P, env, 'C1create', u1, 'carol@example.test');
  const id1 = c1.value?.id;
  const before1 = await P.getCreds();
  let e0 = evCount();
  const s1 = await sig('signalUnknownCredential', { rpId: 'localhost', credentialId: id1 });
  await sleep(300);
  record(env, 'C', 'C1 signalUnknownCredential(own cred)', { createState: c1.state, credId: id1, signal: short(s1), credsBefore: before1?.map(c => c.id), credsAfter: (await P.getCreds())?.map(c => c.id), eventsAfterSignal: P.events.slice(e0) });

  // C2 signalAllAcceptedCredentials with empty list
  const u2 = rid();
  const c2 = await modalCreate(P, env, 'C2create', u2, 'dave@example.test');
  const before2 = await P.getCreds();
  e0 = evCount();
  const s2 = await sig('signalAllAcceptedCredentials', { rpId: 'localhost', userId: u2, allAcceptedCredentialIds: [] });
  await sleep(300);
  record(env, 'C', 'C2 signalAllAcceptedCredentials(userId, [])', { createState: c2.state, credId: c2.value?.id, signal: short(s2), credsBefore: before2?.map(c => c.id), credsAfter: (await P.getCreds())?.map(c => c.id), eventsAfterSignal: P.events.slice(e0) });

  // C2a a second resident create for the SAME user handle on one authenticator: overwrite or add?
  const u2b = rid(), u2c = rid();
  const k1 = await modalCreate(P, env, 'C2b-k1', u2b, 'erin@example.test');
  const k2 = await modalCreate(P, env, 'C2b-k2', u2b, 'erin@example.test');
  const afterK2 = (await P.getCreds())?.map(c => c.id);
  record(env, 'C', 'C2a two modal creates with the same user.id on one authenticator', { k1: k1.state, k2: k2.state, k1StillOnAuthenticator: afterK2?.includes(k1.value?.id), k2OnAuthenticator: afterK2?.includes(k2.value?.id), credCount: afterK2?.length });
  // C2b signalAllAcceptedCredentials keeps a listed cred; another user's cred is untouched; then [] removes it.
  const other = await modalCreate(P, env, 'C2b-other', u2c, 'frank@example.test');
  e0 = evCount();
  const s2b = await sig('signalAllAcceptedCredentials', { rpId: 'localhost', userId: u2b, allAcceptedCredentialIds: [k2.value?.id] });
  await sleep(300);
  const after2b = (await P.getCreds())?.map(c => c.id);
  const ev2b = P.events.slice(e0);
  e0 = evCount();
  const s2c = await sig('signalAllAcceptedCredentials', { rpId: 'localhost', userId: u2b, allAcceptedCredentialIds: [] });
  await sleep(300);
  const after2c = (await P.getCreds())?.map(c => c.id);
  record(env, 'C', 'C2b signalAllAcceptedCredentials(erin, [k2]) then (erin, []); frank has another cred', { listed: { signal: short(s2b), k2kept: after2b?.includes(k2.value?.id), frankKept: after2b?.includes(other.value?.id), events: ev2b }, empty: { signal: short(s2c), k2kept: after2c?.includes(k2.value?.id), frankKept: after2c?.includes(other.value?.id), events: P.events.slice(e0) } });

  // C3 signalCurrentUserDetails
  const u3 = rid();
  const c3 = await modalCreate(P, env, 'C3create', u3, 'grace@example.test');
  const before3 = (await P.getCreds())?.find(c => c.id === c3.value?.id);
  e0 = evCount();
  const s3 = await sig('signalCurrentUserDetails', { rpId: 'localhost', userId: u3, name: 'grace.renamed@example.test', displayName: 'Grace Renamed' });
  await sleep(300);
  const after3 = (await P.getCreds())?.find(c => c.id === c3.value?.id);
  record(env, 'C', 'C3 signalCurrentUserDetails', { signal: short(s3), before: before3 && { userName: before3.userName, userDisplayName: before3.userDisplayName }, after: after3 && { userName: after3.userName, userDisplayName: after3.userDisplayName }, eventsAfterSignal: P.events.slice(e0) });

  // C3b signals with rpId mismatch / unknown ID (input validation)
  // rpId must stay local: for a foreign rpId Chrome fetches https://<rpId>/.well-known/webauthn. *.localhost resolves to loopback.
  const s3b = await sig('signalUnknownCredential', { rpId: 'sub.localhost', credentialId: rid() });
  const s3c = await sig('signalUnknownCredential', { rpId: 'localhost', credentialId: 'not base64url!!' });
  record(env, 'C', 'C3b signalUnknownCredential rpId sub.localhost (not a suffix of origin) / malformed id', { badRpId: short(s3b), badId: short(s3c) });
  await P.close();

  // C4 stale credential: server deleted it, browser still offers it.
  const Q = await newPage(env, { enableUI: false });
  const server = new Set();
  const sigQ = (fnName, a) => clickAndRun(Q.page, `C4-${fnName}-${rid(4)}`, async ({ fnName, a }) => { await PublicKeyCredential[fnName](a); return 'undefined'; }, { fnName, a }, 5000);
  const s = await modalCreate(Q, env, 'C4create', rid(), 'heidi@example.test');
  server.add(s.value.id);
  server.delete(s.value.id); // RP deletes the passkey in its DB only
  const g1 = await modalGet(Q, 'C4get1');
  const g2 = await modalGet(Q, 'C4get2-nosignal');
  const sg = await sigQ('signalUnknownCredential', { rpId: 'localhost', credentialId: s.value.id });
  const g3 = await modalGet(Q, 'C4get3-aftersignal');
  const g4 = await clickAndRun(Q.page, 'C4get4-aftersignal-timeout3000', async () => {
    const ac = new AbortController(); window.__ac = ac;
    const o = h.getOpts(); o.publicKey.timeout = 3000; o.signal = ac.signal;
    return h.serCred(await navigator.credentials.get(o));
  }, null);
  const pr = r => ({ state: r.state, ms: r.ms, name: r.name, message: r.message, returnedId: r.value?.id, serverKnows: r.value ? server.has(r.value.id) : undefined, afterAbort: r.afterAbort && { state: r.afterAbort.state, ms: r.afterAbort.ms, name: r.afterAbort.name, message: r.afterAbort.message } });
  record(env, 'C', 'C4 stale credential (server deleted, only cred on authenticator)', { staleId: s.value.id, get1: pr(g1), get2_noSignal: pr(g2), signal: short(sg), get3_afterSignal: pr(g3), get4_afterSignal_timeout3000: pr(g4), credsAfter: (await Q.getCreds())?.map(c => c.id) });
  await Q.close();

  // C5 stale (account ivan, deleted server-side) + valid (account judy) on one authenticator, both creation orders.
  for (const staleFirst of [true, false]) {
    const R = await newPage(env, { enableUI: false });
    const srv = new Set();
    let stale, valid;
    if (staleFirst) { stale = await modalCreate(R, env, 'C5stale', rid(), 'ivan@example.test'); valid = await modalCreate(R, env, 'C5valid', rid(), 'judy@example.test'); }
    else { valid = await modalCreate(R, env, 'C5valid', rid(), 'judy@example.test'); stale = await modalCreate(R, env, 'C5stale', rid(), 'ivan@example.test'); }
    srv.add(valid.value.id); // stale one was deleted server-side
    const both = (await R.getCreds())?.length;
    const h1 = await modalGet(R, 'C5get1');
    const h1b = await modalGet(R, 'C5get1b');
    const sigR = await clickAndRun(R.page, 'C5sig', async ({ a }) => { await PublicKeyCredential.signalUnknownCredential(a); return 'undefined'; }, { a: { rpId: 'localhost', credentialId: stale.value.id } }, 5000);
    const h2 = await modalGet(R, 'C5get2');
    const tag = r => r.value ? (r.value.id === stale.value.id ? 'STALE' : r.value.id === valid.value.id ? 'VALID' : 'OTHER') : `${r.state} ${r.name || ''}`;
    const smallest = Buffer.compare(Buffer.from(stale.value.id, 'base64url'), Buffer.from(valid.value.id, 'base64url')) < 0 ? 'STALE' : 'VALID';
    record(env, 'C', `C5 stale + valid (different accounts), ${staleFirst ? 'stale created first' : 'valid created first'}, empty allowCredentials`, { smallestCredentialIdIs: smallest, credsOnAuthenticator: both, get1: tag(h1), get1b_noSignal: tag(h1b), signal: sigR.state, get2_afterSignal: tag(h2), serverAcceptsGet2: h2.value ? srv.has(h2.value.id) : false });
    await R.close();
  }
  await testC6(env);
}

// C6: Playwright shim does not see signals? stale credential survives signalUnknownCredential.
async function testC6(env) {
  const context = await env.browser.newContext();
  await context.credentials.install();
  const page = await context.newPage();
  await page.goto(env.base + '/');
  const c = await clickAndRun(page, 'C6c', fCreate, { userId: rid(), name: 'kim@example.test', displayName: 'Kim' });
  const id = c.value?.id;
  const s = await clickAndRun(page, 'C6s', async ({ a }) => { await PublicKeyCredential.signalUnknownCredential(a); return 'undefined'; }, { a: { rpId: 'localhost', credentialId: id } }, 5000);
  const g = await clickAndRun(page, 'C6g', fGet, { allow: [] });
  let stored = null; try { stored = (await context.credentials.get({ rpId: 'localhost' })).map(x => x.id); } catch (e) { stored = 'ERR ' + e.message.split('\n')[0]; }
  record(env, 'C', 'C6 Playwright shim: signalUnknownCredential then get()', { create: c.state, flags: c.value?.flags, signal: short(s), getAfterSignal: { state: g.state, name: g.name, returnedSame: g.value ? g.value.id === id : undefined }, shimStillHas: Array.isArray(stored) ? stored.includes(id) : stored });
  await context.close();
}

async function testD(env) {
  const fn = async () => {
    const out = {};
    out.hasGetClientCapabilities = typeof PublicKeyCredential.getClientCapabilities;
    try { out.getClientCapabilities = await PublicKeyCredential.getClientCapabilities(); } catch (e) { out.getClientCapabilitiesErr = e.name + ': ' + e.message; }
    try { out.isConditionalMediationAvailable = await PublicKeyCredential.isConditionalMediationAvailable(); } catch (e) { out.isConditionalMediationAvailable = 'ERR ' + e.name; }
    try { out.isUVPAA = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { out.isUVPAA = 'ERR ' + e.name; }
    out.signalFns = ['signalUnknownCredential', 'signalAllAcceptedCredentials', 'signalCurrentUserDetails'].map(n => n + ':' + typeof PublicKeyCredential[n]);
    return out;
  };
  const variants = [
    { v: 'no CDP', cdp: false, withAuth: false },
    { v: 'WebAuthn.enable, no authenticator', withAuth: false },
    { v: 'virtual authenticator (internal, rk, uv), enableUI default', withAuth: true },
    { v: 'virtual authenticator, enableUI:true', withAuth: true, enableUI: true },
    { v: 'virtual authenticator usb (cross-platform), enableUI default', withAuth: true, authOpts: { ...AUTH_OPTS, transport: 'usb' } },
  ];
  for (const V of variants) {
    const P = await newPage(env, { cdp: V.cdp !== false, withAuth: V.withAuth, enableUI: V.enableUI, authOpts: V.authOpts });
    const r = await clickAndRun(P.page, 'D', fn, null, 5000);
    record(env, 'D', V.v, { result: r.state === 'resolved' ? r.value : short(r) });
    await P.close();
  }
}

async function testE(env) {
  for (const enableUI of [false, true]) {
    // E1 conditional get with one discoverable credential: stages none -> focus -> click.
    const P = await newPage(env, { enableUI });
    // Seed via CDP (modal create hangs when enableUI:true, see test B).
    const c = await seedCredential(P, 'judy@example.test');
    // Reload so the conditional get starts on a fresh page load without activation.
    await P.page.reload();
    await P.page.evaluate(() => { window.__blockSubmit = true; });
    const t0 = Date.now();
    await runNoClick(P.page, 'E1', async () => {
      const ac = new AbortController(); window.__ac = ac;
      return h.serCred(await navigator.credentials.get({ ...h.getOpts(), mediation: 'conditional', signal: ac.signal }));
    }, null);
    let stage = null; let r;
    const stages = [['no interaction', async () => {}], ['after focus(#username)', () => P.page.focus('#username')], ['after click(#username)', () => P.page.click('#username')], ['after typing "j"', () => P.page.keyboard.type('j')], ['after ArrowDown', () => P.page.keyboard.press('ArrowDown')], ['after Enter', () => P.page.keyboard.press('Enter')]];
    for (const [name, act] of stages) {
      await act();
      try { await P.page.waitForFunction(() => window.__res.E1.state !== 'pending', null, { timeout: 2000, polling: 50 }); } catch {}
      r = await P.page.evaluate(() => window.__res && window.__res.E1);
      if (!r) { r = { state: 'page navigated away', url: P.page.url() }; stage = name; break; }
      if (r.state !== 'pending') { stage = name; break; }
    }
    if (r.state === 'pending') r = await waitResult(P.page, 'E1', Math.max(1000, PENDING_MS - (Date.now() - t0)));
    const submitBlocked = await P.page.evaluate(() => window.__submitBlocked || 0).catch(() => 'n/a');
    record(env, 'E', `E1 conditional get, 1 credential, enableUI:${enableUI}`, { createState: c.state, resolvedAtStage: stage, formSubmitAttemptsBlocked: submitBlocked, usernameFieldValue: await P.page.inputValue('#username').catch(() => 'n/a'), result: short(r), returnedIsCreated: r.value ? r.value.id === c.value?.id : undefined, cdpEvents: P.events.map(e => e.ev) });
    await P.close();

    // E1b conditional get with an authenticator that has no credentials.
    const Q = await newPage(env, { enableUI });
    await runNoClick(Q.page, 'E1b', async () => {
      const ac = new AbortController(); window.__ac = ac;
      return h.serCred(await navigator.credentials.get({ ...h.getOpts(), mediation: 'conditional', signal: ac.signal }));
    }, null);
    const rb = await waitResult(Q.page, 'E1b');
    record(env, 'E', `E1b conditional get, 0 credentials, enableUI:${enableUI}`, { result: short(rb) });
    await Q.close();
  }

  // E2 modal get with 2 discoverable credentials: 8 fresh authenticators, which one is returned?
  const trials = [];
  for (let t = 0; t < 8; t++) {
    const P = await newPage(env, { enableUI: false });
    const made = [];
    for (const u of ['first', 'second']) { const uh = rid(); const r = await modalCreate(P, env, 'E2' + u, uh, u + '@example.test'); made.push({ u, cred: r.value?.id, uh }); }
    const g = [];
    for (let i = 0; i < 3; i++) g.push(await modalGet(P, 'E2get'));
    const who = r => r.value ? (made.find(m => m.uh === r.value.userHandle)?.u || 'unknown') : `${r.state} ${r.name}`;
    const credsNow = await P.getCreds();
    const byIdBytes = [...made].sort((a, b) => Buffer.compare(Buffer.from(a.cred, 'base64url'), Buffer.from(b.cred, 'base64url')))[0].u;
    trials.push({ returned: g.map(who), smallestIdIs: byIdBytes, getCredentialsOrder: credsNow.map(c => made.find(m => m.cred === c.id)?.u), signCounts: Object.fromEntries(credsNow.map(c => [made.find(m => m.cred === c.id)?.u, c.signCount])), assertedEventsPerGet: P.events.filter(e => e.ev === 'credentialAsserted').length / 3 });
    await P.close();
  }
  record(env, 'E', 'E2 modal get, 2 discoverable creds (created "first" then "second"), 8 fresh authenticators x 3 gets', {
    summary: { alwaysFirstCreated: trials.every(t => t.returned.every(x => x === 'first')), returnedEqualsSmallestId: trials.filter(t => t.returned[0] === t.smallestIdIs).length + '/8', getCredentialsOrderIsCreationOrder: trials.filter(t => t.getCredentialsOrder.join() === 'first,second').length + '/8' },
    trials,
  });
}

// Seed a discoverable P-256 credential through CDP (WebAuthn.addCredential).
async function seedCredential(P, userName) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const credId = randomBytes(32), userHandle = randomBytes(16);
  try {
    await P.client.send('WebAuthn.addCredential', { authenticatorId: P.authenticatorId, credential: {
      credentialId: credId.toString('base64'), isResidentCredential: true, rpId: 'localhost',
      privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      userHandle: userHandle.toString('base64'), signCount: 0, userName, userDisplayName: userName } });
    return { state: 'seeded via WebAuthn.addCredential', value: { id: credId.toString('base64url') } };
  } catch (e) { return { state: 'seed failed: ' + e.message.split('\n')[0] }; }
}

const DC_REQ = { digital: { requests: [{ protocol: 'openid4vp-v1-unsigned', data: { response_type: 'vp_token', nonce: 'test', dcql_query: { credentials: [{ id: 'c1', format: 'dc+sd-jwt', meta: { vct_values: ['urn:test'] }, claims: [{ path: ['given_name'] }] }] } } }] } };
const fDcGet = async (req) => {
  const ac = new AbortController(); window.__ac = ac;
  const c = await navigator.credentials.get({ ...req, signal: ac.signal });
  if (!c) return null;
  return { ctor: c.constructor && c.constructor.name, type: c.type, id: c.id, protocol: c.protocol, data: c.data };
};

async function testF(env) {
  // F0 feature detection
  {
    const P = await newPage(env, { cdp: false, withAuth: false });
    const r = await clickAndRun(P.page, 'F0', async () => {
      const o = { typeofDigitalCredential: typeof DigitalCredential };
      if (typeof DigitalCredential !== 'undefined') {
        o.typeofUserAgentAllowsProtocol = typeof DigitalCredential.userAgentAllowsProtocol;
        for (const p of ['openid4vp-v1-unsigned', 'openid4vp-v1-signed', 'openid4vp-v1-multisigned', 'org-iso-mdoc', 'openid4vp', 'openid4vci-v1', 'made-up-protocol']) {
          try { o['allows:' + p] = DigitalCredential.userAgentAllowsProtocol(p); } catch (e) { o['allows:' + p] = 'ERR ' + e.name + ': ' + e.message; }
        }
        o.protoProps = Object.getOwnPropertyNames(DigitalCredential.prototype);
      }
      o.typeofIdentityCredential = typeof IdentityCredential;
      return o;
    }, null, 5000);
    record(env, 'F', 'F0 feature detection (no CDP)', { result: r.state === 'resolved' ? r.value : short(r) });
    await P.close();
  }

  const dcCase = async (variant, cmds, { cdp = true, req = DC_REQ } = {}) => {
    const P = await newPage(env, { cdp, withAuth: false, webauthn: false });
    const cmdResults = [];
    if (cdp) {
      for (const c of cmds) {
        try { const v = await P.client.send('DigitalCredentials.setVirtualWalletBehavior', c); cmdResults.push({ params: c, ok: true, ret: v }); }
        catch (e) { cmdResults.push({ params: c, ok: false, error: e.message.split('\n')[0] }); }
      }
    }
    const r = await clickAndRun(P.page, 'F', fDcGet, req);
    record(env, 'F', variant, { cdp: cmdResults, result: short(r) });
    await P.close();
    return cmdResults;
  };
  const respond = { action: 'respond', protocol: 'openid4vp-v1-unsigned', response: { vp_token: { c1: ['eyJ0eXAiOiJkYytzZC1qd3QifQ.test-not-a-real-credential~'] } } };
  await dcCase('F1 setVirtualWalletBehavior({}) (no params), then get', [{}]);
  await dcCase('F2 respond with test data, then get', [respond]);
  await dcCase('F3 decline, then get', [{ action: 'decline' }]);
  await dcCase('F4 wait (never respond), then get', [{ action: 'wait' }]);
  await dcCase('F5 respond with protocol "openid4vp" (mismatch), then get', [{ ...respond, protocol: 'openid4vp' }]);
  await dcCase('F6 decline with a protocol (forbidden?)', [{ action: 'decline', protocol: 'openid4vp-v1-unsigned' }]);
  await dcCase('F7 clear (back to real provider), then get', [{ action: 'clear' }]);
  await dcCase('F8 no CDP, real provider, then get', [], { cdp: false });
  // F9 sticky check: one respond, two consecutive gets on the same page.
  {
    const P = await newPage(env, { withAuth: false, webauthn: false });
    let set;
    try { set = await P.client.send('DigitalCredentials.setVirtualWalletBehavior', respond); } catch (e) { set = { error: e.message.split('\n')[0] }; }
    const r1 = await clickAndRun(P.page, 'F9a', fDcGet, DC_REQ);
    const r2 = await clickAndRun(P.page, 'F9b', fDcGet, DC_REQ);
    record(env, 'F', 'F9 one respond, two gets on same page', { set, first: short(r1), second: short(r2) });
    await P.close();
  }
  // F10 respond configured, but get() started without a click (no transient user activation).
  {
    const P = await newPage(env, { withAuth: false, webauthn: false });
    let set;
    try { set = await P.client.send('DigitalCredentials.setVirtualWalletBehavior', respond); } catch (e) { set = { error: e.message.split('\n')[0] }; }
    await runNoClick(P.page, 'F10', fDcGet, DC_REQ);
    const r = await waitResult(P.page, 'F10');
    record(env, 'F', 'F10 respond, get() without user activation', { set, result: short(r) });
    await P.close();
  }
}

// H: how many discoverable credentials does one CDP virtual authenticator hold?
async function testH(env) {
  const P = await newPage(env, { enableUI: false });
  const states = [], made = [];
  for (let i = 0; i < 5; i++) {
    const r = await modalCreate(P, env, 'H', rid(), `cap${i}@example.test`);
    states.push(r.state === 'resolved' ? 'ok' : `${r.state} ${r.name} (${r.ms} ms)`);
    if (r.value) made.push(r.value.id);
  }
  const n = (await P.getCreds()).length;
  const nonRk = await clickAndRun(P.page, 'Hnr', fCreate, { userId: rid(), name: 'nonrk@example.test', displayName: 'nonrk', rk: 'discouraged' });
  const seeded = await seedCredential(P, 'seeded@example.test');
  const residentBeforeRemove = (await P.getCreds()).filter(c => c.rk).length;
  await P.client.send('WebAuthn.removeCredential', { authenticatorId: P.authenticatorId, credentialId: Buffer.from(made[0], 'base64url').toString('base64') });
  const residentAfterRemove = (await P.getCreds()).filter(c => c.rk).length;
  const after = await modalCreate(P, env, 'H2', rid(), 'cap-after-remove@example.test');
  record(env, 'H', 'resident-key capacity of one virtual authenticator', { fiveResidentCreates: states, residentCredsStored: n, nonResidentCreateWhenFull: { state: nonRk.state, name: nonRk.name }, nonResidentCreateStoredAsResident: nonRk.value ? ((await P.getCreds()).find(c => c.id === nonRk.value.id)?.rk ?? 'not listed') : undefined, addCredentialWhenFull: seeded.state, residentBeforeRemove, residentAfterRemove, residentCreateAfterRemovingACreatedOne: after.state === 'resolved' ? 'ok' : `${after.state} ${after.name}`, credsAtEnd: (await P.getCreds()).map(c => c.rk) });
  await P.close();
}

async function testG(env) {
  const P = await newPage(env, { enableUI: false });
  const c = [], g = [], pair = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    const rc = await modalCreate(P, env, 'Gc', rid(), `timing${i}@example.test`);
    if (rc.state !== "resolved") throw new Error("G create failed at i=" + i + " " + JSON.stringify(short(rc)));
    const rg = await modalGet(P, "Gg", [rc.value.id]);
    pair.push(performance.now() - t0);
    if (rc.state !== 'resolved' || rg.state !== 'resolved') throw new Error('G failed ' + JSON.stringify([short(rc), short(rg)]));
    c.push(rc.ms); g.push(rg.ms);
    // The virtual authenticator holds few resident keys (test H), so empty it between pairs (outside the timed part).
    await P.client.send('WebAuthn.clearCredentials', { authenticatorId: P.authenticatorId });
  }
  const st = a => { const s = [...a].sort((x, y) => x - y); const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; return { median: +m.toFixed(1), min: +s[0].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
  record(env, 'G', '10 x (modal create + get by id), enableUI default, clearCredentials between pairs', { createInPageMs: st(c), getInPageMs: st(g), pairWallClockMs_driver: st(pair), rawCreate: c, rawGet: g, rawPair: pair.map(x => Math.round(x)) });
  await P.close();
}

// P: protocol discovery on a browser we launch ourselves with --remote-debugging-port.
async function testP(cfg) {
  const out = { config: cfg.name, exe: cfg.exe };
  if (!fs.existsSync(cfg.exe)) { out.error = 'exe not found'; return out; }
  let port = await freePort();
  while (port === 9333) port = await freePort();
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-udd-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
  if (!cfg.exe.includes('headless-shell')) args.unshift('--headless=new');
  const child = spawn(cfg.exe, args, { stdio: 'ignore' });
  try {
    let ver;
    for (let i = 0; i < 100 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
    out.version = ver && ver.Browser;
    out.protocolVersion = ver && ver['Protocol-Version'];
    const proto = await (await fetch(`http://127.0.0.1:${port}/json/protocol`)).json();
    const dom = n => proto.domains.find(d => d.domain === n);
    const dc = dom('DigitalCredentials');
    out.DigitalCredentials = dc ? { experimental: dc.experimental, description: dc.description, types: dc.types, commands: dc.commands, events: dc.events } : 'ABSENT';
    const wa = dom('WebAuthn');
    out.WebAuthn = wa ? { commands: wa.commands.map(c => c.name), events: (wa.events || []).map(e => e.name), enableParams: wa.commands.find(c => c.name === 'enable')?.parameters, authOptions: wa.types.find(t => t.id === 'VirtualAuthenticatorOptions')?.properties.map(p => p.name) } : 'ABSENT';
    out.domainCount = proto.domains.length;
    fs.writeFileSync(path.join(OUT, `protocol-${cfg.name}.json`), JSON.stringify(proto, null, 1));
    // Close our own browser via CDP.
    await new Promise(res => {
      const ws = new WebSocket(ver.webSocketDebuggerUrl);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      ws.onmessage = () => { try { ws.close(); } catch {} res(); };
      ws.onerror = () => res(); ws.onclose = () => res();
      setTimeout(res, 3000);
    });
  } catch (e) { out.error = e.message; }
  finally {
    await sleep(1000);
    if (child.exitCode === null) { try { child.kill(); } catch {} } // only our own spawned PID
    await sleep(500);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  }
  return out;
}

// ---------- main ----------
const TESTS = { A: testA, B: testB, C: testC, D: testD, E: testE, F: testF, G: testG, H: testH };
const { server, port } = await startServer();
const base = `http://localhost:${port}`;
let pwVersion = JSON.parse(fs.readFileSync(path.join(HERE, 'node_modules/playwright/package.json'), 'utf8')).version;
const meta = { started: new Date().toISOString(), playwright: pwVersion, node: process.version, os: `${os.type()} ${os.release()} ${os.version?.() || ''} ${os.arch()}`, base, configs: [] };
log('META', meta);

if (ONLY.includes('P')) {
  for (const cfg of CONFIGS.filter(c => !c.explicit)) {
    const p = await testP(cfg);
    log(`[${cfg.name}] P protocol =>`, { version: p.version, protocolVersion: p.protocolVersion, domainCount: p.domainCount, DigitalCredentials: p.DigitalCredentials, WebAuthn: p.WebAuthn, error: p.error });
    results.push({ config: cfg.name, test: 'P', variant: 'protocol JSON', ...p });
  }
}

for (const cfg of CONFIGS) {
  for (let run = 1; run <= RUNS; run++) {
    let browser;
    try { browser = await chromium.launch(cfg.launch); }
    catch (e) { log(`[${cfg.name}] launch failed: ${e.message.split('\n')[0]}`); break; }
    const version = browser.version();
    if (run === 1) meta.configs.push({ name: cfg.name, label: cfg.label, version });
    log(`[${cfg.name} r${run}] browser.version() = ${version} (${cfg.label})`);
    // Schema.getDomains via a browser-level CDP session (Playwright-owned browser).
    if (run === 1 && ONLY.includes('P')) {
      try {
        const bs = await browser.newBrowserCDPSession();
        const d = await bs.send('Schema.getDomains').catch(e => ({ error: e.message.split('\n')[0] }));
        log(`[${cfg.name}] Schema.getDomains =>`, d.error ? d : { count: d.domains.length, hasDigitalCredentials: d.domains.some(x => x.name === 'DigitalCredentials'), hasWebAuthn: d.domains.some(x => x.name === 'WebAuthn') });
        await bs.detach();
      } catch (e) { log(`[${cfg.name}] browser CDP session failed: ${e.message}`); }
    }
    const env = { browser, cfg, run, base };
    for (const t of ONLY) {
      if (!TESTS[t]) continue;
      if (cfg.onlyTests && !cfg.onlyTests.includes(t)) continue;
      try { await TESTS[t](env); }
      catch (e) { log(`[${cfg.name} r${run}] ${t} CRASHED: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); results.push({ config: cfg.name, run, test: t, crashed: e.message }); }
    }
    await browser.close();
  }
}
meta.finished = new Date().toISOString();
fs.writeFileSync(JSONFILE, JSON.stringify({ meta, results }, null, 1));
log('DONE', { log: LOGFILE, json: JSONFILE });
server.close();
