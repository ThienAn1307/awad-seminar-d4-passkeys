// Browser and virtual-authenticator helpers shared by measure.mjs and the checks.
// Settings follow docs/method.md section 3 and the spike (spike/README.md).
import { chromium } from 'playwright';

// Chrome for Testing, new headless. Never the headless shell: it ignores enableUI and
// fails resident-key creates without CDP (spike section 5).
export const LAUNCH = { channel: 'chromium', headless: process.env.HEADED !== '1' };

export const AUTHENTICATOR = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

export function base64ToBase64url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isLocalUrl(url) {
  const u = new URL(url);
  if (u.protocol === 'data:') return true;
  if (u.protocol === 'blob:') return isLocalUrl(url.slice('blob:'.length));
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
}

export async function launchBrowser() {
  return chromium.launch(LAUNCH);
}

// A fresh context whose only allowed traffic is to localhost. Anything else is aborted
// and pushed onto `blocked`, which must stay empty for a run to count.
export async function newIsolatedContext(browser) {
  const context = await browser.newContext();
  const blocked = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocalUrl(url)) return route.continue();
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  return { context, blocked };
}

// Attach a virtual authenticator to the page's target. `enableUI` stays false unless
// asked: with it on, Chrome waits for clicks in its own UI that Playwright cannot make.
export async function addAuthenticator(page, { enableUI = false } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', enableUI ? { enableUI: true } : {});
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR });
  return {
    cdp,
    authenticatorId,
    async credentialIds() {
      const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
      return credentials.map((c) => base64ToBase64url(c.credentialId));
    },
  };
}

export async function browserVersions(browser) {
  return { browser: browser.version(), playwright: (await import('playwright/package.json', { with: { type: 'json' } })).default.version };
}
