// npm run check:conditional-create
//
// Evidence for docs/method.md section 11: conditional create
// (navigator.credentials.create({ mediation: 'conditional' })) never produces a passkey under
// CDP automation, so the study cannot measure it. A modal create on the same authenticator
// is the control: if the control fails, the harness is broken and the check exits non-zero.
import http from 'node:http';
import { launchBrowser, newIsolatedContext, addAuthenticator, browserVersions } from './browser.mjs';
import { newResultsDir, environment, writeJson, appendJsonl } from './results.mjs';

const TRIALS = Number(process.env.TRIALS ?? 5);
const CREATE_TIMEOUT_MS = 5000; // same 5 s limit as every WebAuthn call in the study
const HARD_LIMIT_MS = CREATE_TIMEOUT_MS + 3000;

const VARIANTS = [
  { name: 'conditional, enableUI false', mediation: 'conditional', enableUI: false },
  { name: 'conditional, enableUI true', mediation: 'conditional', enableUI: true },
  { name: 'control: modal create', mediation: undefined, enableUI: false },
];

// One page with a button; the create runs inside the click handler (user activation).
const PAGE = `<!doctype html><meta charset="utf-8"><title>conditional create check</title>
<input autocomplete="username webauthn"><button id="go">create</button>
<script>
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
document.getElementById('go').addEventListener('click', async () => {
  const cfg = window.checkConfig;
  const t0 = performance.now();
  const publicKey = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { id: 'localhost', name: 'D4 check' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'check@localhost.test', displayName: 'check' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    timeout: ${CREATE_TIMEOUT_MS},
  };
  try {
    const cred = await navigator.credentials.create(cfg.mediation ? { publicKey, mediation: cfg.mediation } : { publicKey });
    window.result = { state: 'resolved', ms: Math.round(performance.now() - t0), id: b64url(cred.rawId) };
  } catch (e) {
    window.result = { state: 'rejected', ms: Math.round(performance.now() - t0), errorName: e.name, message: e.message };
  }
});
</script>`;

function startPageServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function trial(browser, url, variant) {
  const { context, blocked } = await newIsolatedContext(browser);
  try {
    const page = await context.newPage();
    const auth = await addAuthenticator(page, { enableUI: variant.enableUI });
    await page.goto(url);
    await page.evaluate((cfg) => { window.checkConfig = cfg; }, { mediation: variant.mediation });
    await page.click('#go');
    let result;
    try {
      await page.waitForFunction(() => window.result !== undefined, null, { timeout: HARD_LIMIT_MS });
      result = await page.evaluate(() => window.result);
    } catch {
      result = { state: 'pending', ms: HARD_LIMIT_MS };
    }
    const credentialsAfter = (await auth.credentialIds()).length;
    return { ...result, credentialsAfter, created: credentialsAfter > 0, blocked };
  } finally {
    await context.close();
  }
}

const server = await startPageServer();
const url = `http://localhost:${server.address().port}/`;
const browser = await launchBrowser();
const dir = newResultsDir('conditional-create');
writeJson(dir, 'env.json', environment({ ...(await browserVersions(browser)), trials: TRIALS, createTimeoutMs: CREATE_TIMEOUT_MS }));

const summary = {};
try {
  for (const variant of VARIANTS) {
    const rows = [];
    for (let i = 1; i <= TRIALS; i++) {
      const row = { variant: variant.name, trial: i, ...(await trial(browser, url, variant)) };
      appendJsonl(dir, 'trials.jsonl', row);
      rows.push(row);
      console.log(`${variant.name} #${i}: ${row.state}${row.errorName ? ' ' + row.errorName : ''} in ${row.ms} ms, credentials on authenticator: ${row.credentialsAfter}`);
    }
    summary[variant.name] = {
      created: rows.filter((r) => r.created).length,
      trials: rows.length,
      outcomes: [...new Set(rows.map((r) => `${r.state}${r.errorName ? ' ' + r.errorName : ''}`))],
      blockedRequests: rows.flatMap((r) => r.blocked),
    };
  }
} finally {
  await browser.close();
  server.close();
}

writeJson(dir, 'summary.json', summary);
console.log('\n' + Object.entries(summary).map(([k, v]) => `${k}: ${v.created}/${v.trials} created`).join('\n'));
console.log(`raw log: ${dir}`);

const control = summary['control: modal create'];
const external = Object.values(summary).flatMap((v) => v.blockedRequests);
if (control.created !== control.trials || external.length > 0) {
  console.error('check invalid: the control did not always create a passkey, or a request left localhost');
  process.exit(1);
}
