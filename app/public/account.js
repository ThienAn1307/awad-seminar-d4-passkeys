window.lab = {};
if (document.body.dataset.state !== 'error') {
  window.lab.registerPasskey = async () => {
    const options = await fetch('/api/register/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!options.ok) throw new Error((await options.json()).error);
    const response = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: await options.json() });
    const verified = await fetch('/api/register/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response }) });
    const result = await verified.json();
    if (!verified.ok) throw new Error(result.error);
    return result;
  };
}
