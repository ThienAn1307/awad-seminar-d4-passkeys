// npm run measure
//
// Runs docs/method.md end to end: both arms RUNS times each in ABBA order, then the probe,
// each execution with a fresh app (new port, empty store) and a fresh browser. Writes
// results/<timestamp>/: env.json, executions.json, raw/<n>-<study>-<arm>.jsonl, summary.json.
// Exits non-zero if any arm or probe variant has fewer than RUNS valid executions.
//
// Dev knobs (never for the committed results): RUNS, USERS, ONLY=main|probe, HEADED=1.
import fs from 'node:fs';
import path from 'node:path';
import { startApp } from '../app/server.mjs';
import { launchBrowser, browserVersions, AUTHENTICATOR } from './browser.mjs';
import { enrollUser } from './setup.mjs';
import { runSession, WEBAUTHN_TIMEOUT_MS } from './session.mjs';
import { summarize, probeMetrics, spread } from './summarize.mjs';
import { newResultsDir, environment, writeJson, appendJsonl } from './results.mjs';
import { abbaOrder } from './order.mjs';

const RUNS = Number(process.env.RUNS ?? 5);
const USERS = Number(process.env.USERS ?? 10);
const SESSIONS = 5;
const ONLY = process.env.ONLY ?? 'all';
const PASSWORD = 'pw-0123456789abc'; // 16 characters, the same for every user and arm

const COHORTS = [
  { cohort: 'stale', prefix: 'stale', passkey: 'stale' },
  { cohort: 'valid', prefix: 'valid', passkey: 'valid' },
  { cohort: 'nopasskey', prefix: 'nopass', passkey: 'none' },
];

const PROBE_VARIANTS = [
  { variant: 'correct, with password', acceptedList: 'correct', hasPassword: true },
  { variant: 'correct, passkey only', acceptedList: 'correct', hasPassword: false },
  { variant: 'incomplete, with password', acceptedList: 'incomplete', hasPassword: true },
  { variant: 'incomplete, passkey only', acceptedList: 'incomplete', hasPassword: false },
];

const pad = (n) => String(n).padStart(2, '0');

async function execute({ dir, seq, study, arm, appOptions, users }) {
  const file = `${pad(seq)}-${study}-${arm.replace(/[^a-z]+/gi, '-')}.jsonl`;
  const rows = [];
  const blocked = [];
  let status = 'ok';
  let error = null;
  const app = await startApp({ port: 0, ...appOptions });
  const browser = await launchBrowser();
  try {
    for (const spec of users) {
      const u = await enrollUser({ browser, baseUrl: app.url, ...spec });
      try {
        for (let session = 1; session <= SESSIONS; session++) {
          const row = { seq, study, arm, cohort: spec.cohort, user: spec.username, session, ...(await runSession({ ...u, baseUrl: app.url })) };
          appendJsonl(path.join(dir, 'raw'), file, row);
          rows.push(row);
        }
      } finally {
        blocked.push(...u.blocked);
        await u.context.close();
      }
    }
    if (blocked.length > 0) throw new Error(`requests left localhost: ${blocked.join(', ')}`);
  } catch (e) {
    status = 'error';
    error = e.message;
    console.error(`  execution ${seq} (${study}, ${arm}) failed: ${e.message}`);
  } finally {
    await browser.close();
    await app.close();
  }
  return { seq, study, arm, status, error, file, rows };
}

function mainUsers() {
  return COHORTS.flatMap(({ cohort, prefix, passkey }) => Array.from({ length: USERS }, (_, i) => (
    { cohort, username: `${prefix}${pad(i + 1)}`, password: PASSWORD, passkey })));
}

function probeUsers({ hasPassword }) {
  return Array.from({ length: USERS }, (_, i) => (
    { cohort: 'valid', username: `probe${pad(i + 1)}`, password: hasPassword ? PASSWORD : null, passkey: 'valid', secondDevice: true }));
}

const dir = newResultsDir();
fs.mkdirSync(path.join(dir, 'raw'));
const versionProbe = await launchBrowser();
const versions = await browserVersions(versionProbe);
await versionProbe.close();
const order = abbaOrder(RUNS);
writeJson(dir, 'env.json', environment({
  ...versions, runsPerArm: RUNS, usersPerCohort: USERS, sessions: SESSIONS, order,
  webauthnTimeoutMs: WEBAUTHN_TIMEOUT_MS, authenticator: AUTHENTICATOR, passwordLength: PASSWORD.length,
  cohorts: COHORTS, probeVariants: PROBE_VARIANTS,
}));

const executions = [];
let seq = 0;
if (ONLY !== 'probe') {
  for (const arm of order) {
    seq += 1;
    console.log(`execution ${seq}: main, ${arm}`);
    executions.push(await execute({ dir, seq, study: 'main', arm, appOptions: { signal: arm === 'change' }, users: mainUsers() }));
  }
}
if (ONLY !== 'main') {
  for (let run = 1; run <= RUNS; run++) {
    // Rotate the variant order each run for the same reason as ABBA.
    const variants = PROBE_VARIANTS.map((_, i) => PROBE_VARIANTS[(i + run - 1) % PROBE_VARIANTS.length]);
    for (const v of variants) {
      seq += 1;
      console.log(`execution ${seq}: probe, ${v.variant}`);
      executions.push(await execute({ dir, seq, study: 'probe', arm: v.variant, appOptions: { signal: true, acceptedList: v.acceptedList }, users: probeUsers(v) }));
    }
  }
}
writeJson(dir, 'executions.json', executions.map(({ rows, ...e }) => ({ ...e, sessions: rows.length })));

const main = summarize(executions.filter((e) => e.study === 'main').map((e) => ({ run: e.seq, arm: e.arm, status: e.status, rows: e.rows })), { minRuns: RUNS });
const probe = {};
for (const { variant } of PROBE_VARIANTS) {
  const ok = executions.filter((e) => e.study === 'probe' && e.arm === variant && e.status === 'ok');
  const perRun = ok.map((e) => ({ run: e.seq, ...probeMetrics(e.rows) }));
  const keys = ['passkeyDeletedPct', 'lockoutPct', 'firstTryPct', 'actionsPerSignin'];
  probe[variant] = {
    validRuns: ok.length,
    ...(perRun.length ? Object.fromEntries(keys.map((k) => [k, spread(perRun.map((m) => m[k]))])) : {}),
    perRun,
  };
}
const probeEnough = ONLY === 'main' || Object.values(probe).every((p) => p.validRuns >= RUNS);
writeJson(dir, 'summary.json', { main, probe, enoughRuns: (ONLY === 'probe' || main.enoughRuns) && probeEnough });

const fmt = (s) => (s ? `${s.median} (${s.min} to ${s.max}${s.identical ? `, ${s.n}/${s.n} identical` : ''})` : 'n/a');
for (const [arm, a] of Object.entries(main.arms)) {
  console.log(`${arm}: stale cohort, sessions 2-5: first try ${fmt(a.headline?.firstTryPct)} %, ${fmt(a.headline?.actionsPerSignin)} actions/sign-in; valid runs ${a.validRuns}, errors ${a.errorRuns}`);
}
for (const [variant, p] of Object.entries(probe)) {
  if (p.validRuns) console.log(`probe ${variant}: passkey deleted ${fmt(p.passkeyDeletedPct)} %, lockout ${fmt(p.lockoutPct)} %`);
}
console.log(`results: ${dir}`);
if (!((ONLY === 'probe' || main.enoughRuns) && probeEnough)) {
  console.error(`fewer than ${RUNS} valid executions for some arm or probe variant; see executions.json`);
  process.exit(1);
}
