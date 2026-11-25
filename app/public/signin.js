const lab = window.lab = { autofill: null, errorName: null, credentialId: null, passkeyResult: null, signalled: [], signalError: null, passwordResult: null };
const message = document.querySelector('#message');
const state = (value) => { document.body.dataset.state = value; };
async function post(path, data) { const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); return { ok: res.ok, body: await res.json() }; }
async function accepted(user) {
  if (window.labConfig.acceptedList === 'off') return;
  try { await PublicKeyCredential.signalAllAcceptedCredentials({ rpId: 'localhost', userId: user.userId, allAcceptedCredentialIds: user.acceptedCredentialIds }); lab.signalled.push('allAcceptedCredentials'); } catch (err) { lab.signalError = err.name; }
}
document.querySelector('#form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await post('/api/signin/password', { username: document.querySelector('#username').value, password: document.querySelector('#password').value });
    if (!result.ok) { lab.passwordResult = 'bad_credentials'; message.textContent = 'Sai tên đăng nhập hoặc mật khẩu'; state('password'); return; }
    lab.passwordResult = 'ok'; await accepted(result.body); state('signed-in');
  } catch (err) { lab.errorName = err.name; message.textContent = err.name; state('error'); }
});
try {
  const options = await post('/api/signin/options', {});
  const response = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options.body, useBrowserAutofill: true });
  lab.autofill = 'credential'; lab.credentialId = response.id;
  const result = await post('/api/signin/passkey', { response });
  if (result.ok) { lab.passkeyResult = 'ok'; await accepted(result.body); state('signed-in'); }
  else if (result.body.error === 'unknown_credential') {
    lab.passkeyResult = 'unknown_credential';
    if (window.labConfig.signal) {
      try { await PublicKeyCredential.signalUnknownCredential({ rpId: 'localhost', credentialId: response.id }); lab.signalled.push('unknownCredential'); } catch (err) { lab.signalError = err.name; }
    }
    message.textContent = 'Passkey này không còn dùng được. Hãy đăng nhập bằng mật khẩu.'; state('password');
  } else { lab.passkeyResult = result.body.error; message.textContent = result.body.error; state('error'); }
} catch (err) {
  lab.errorName = err.name;
  if (err.name === 'NotAllowedError') { lab.autofill = 'none'; state('password'); }
  else { lab.autofill = 'error'; message.textContent = err.name; state('error'); }
}
