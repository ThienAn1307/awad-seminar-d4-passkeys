// Cohort setup (docs/method.md section 4), done through the app's /lab endpoints and the
// /account page. Nothing here is counted in the metrics.
import { newIsolatedContext, addAuthenticator } from './browser.mjs';

async function call(page, method, url, data) {
  const res = await page.request.fetch(url, { method, data, failOnStatusCode: false });
  if (res.status() >= 400) throw new Error(`${method} ${url} -> ${res.status()} ${await res.text()}`);
  return res.status() === 204 ? null : res.json();
}

export function labUser(page, baseUrl, username) {
  return call(page, 'GET', `${baseUrl}/lab/users/${encodeURIComponent(username)}`);
}

// Modal create on /account, as a signed-in user, on this page's authenticator.
async function registerPasskey(page, baseUrl, username) {
  await call(page, 'POST', `${baseUrl}/lab/session`, { username });
  await page.goto(`${baseUrl}/account`);
  const { credentialId } = await page.evaluate(() => window.lab.registerPasskey());
  await call(page, 'POST', `${baseUrl}/api/signout`);
  return credentialId;
}

// passkey: 'none' | 'valid' | 'stale'. secondDevice: also register a passkey from another
// context ("the phone"), after this one, for the probe (method.md section 8).
// The returned page carries the user's authenticator: sessions must reuse this tab, because
// a CDP virtual authenticator belongs to one tab and dies with it.
export async function enrollUser({ browser, baseUrl, username, password, passkey, secondDevice = false }) {
  const { context, blocked } = await newIsolatedContext(browser);
  const page = await context.newPage();
  const auth = await addAuthenticator(page);
  await call(page, 'POST', `${baseUrl}/lab/users`, { username, password });

  let credentialId = null;
  if (passkey !== 'none') credentialId = await registerPasskey(page, baseUrl, username);

  let phoneCredentialId = null;
  if (secondDevice) {
    const phone = await newIsolatedContext(browser);
    const phonePage = await phone.context.newPage();
    await addAuthenticator(phonePage);
    phoneCredentialId = await registerPasskey(phonePage, baseUrl, username);
    blocked.push(...phone.blocked);
    await phone.context.close();
  }

  if (passkey === 'stale') {
    await call(page, 'DELETE', `${baseUrl}/lab/users/${encodeURIComponent(username)}/credentials/${credentialId}`);
  }

  return { context, page, auth, blocked, user: { username, password, credentialId, phoneCredentialId } };
}
