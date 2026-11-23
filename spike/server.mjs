// Tiny local test server (node:http only). Serves one page on http://localhost:<port>.
// The page exposes helpers on window.h and a #go button that runs whatever function
// the driver queued in window.__pending, so every WebAuthn / DC call happens inside a
// real click handler (transient user activation).
import http from 'node:http';

const PAGE_SCRIPT = String.raw`
window.h = {
  rnd(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; },
  b64u(buf) {
    const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  fromB64u(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const bin = atob(s); const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  },
  flags(authData) {
    const u = new Uint8Array(authData); const f = u[32];
    return { byte: '0x' + f.toString(16).padStart(2, '0'), UP: !!(f & 1), UV: !!(f & 4), BE: !!(f & 8), BS: !!(f & 16), AT: !!(f & 64), ED: !!(f & 128),
             signCount: (u[33] << 24 | u[34] << 16 | u[35] << 8 | u[36]) >>> 0 };
  },
  serCred(c) {
    if (!c) return null;
    const o = { id: c.id, type: c.type, ctor: c.constructor && c.constructor.name, authenticatorAttachment: c.authenticatorAttachment };
    try { o.ext = c.getClientExtensionResults(); } catch (e) {}
    const r = c.response;
    o.clientData = JSON.parse(new TextDecoder().decode(r.clientDataJSON));
    if (r.getAuthenticatorData) {
      o.kind = 'attestation'; o.flags = h.flags(r.getAuthenticatorData());
      try { o.transports = r.getTransports(); } catch (e) {}
    } else {
      o.kind = 'assertion'; o.flags = h.flags(r.authenticatorData);
      o.userHandle = r.userHandle ? h.b64u(r.userHandle) : null;
    }
    return o;
  },
  createOpts({ userId, name, displayName, uv = 'preferred', exclude = [], rk = 'required' }) {
    return { publicKey: {
      challenge: h.rnd(32), rp: { id: 'localhost', name: 'Spike RP' },
      user: { id: h.fromB64u(userId), name, displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: rk, requireResidentKey: rk === 'required', userVerification: uv },
      attestation: 'none',
      excludeCredentials: exclude.map(id => ({ type: 'public-key', id: h.fromB64u(id) })),
    } };
  },
  getOpts({ allow = [], uv = 'preferred' } = {}) {
    return { publicKey: { challenge: h.rnd(32), rpId: 'localhost', userVerification: uv,
      allowCredentials: allow.map(id => ({ type: 'public-key', id: h.fromB64u(id) })) } };
  },
};
window.__res = {};
// Runs the queued function synchronously inside the click handler.
window.__start = (p) => {
  const t0 = performance.now();
  window.__res[p.id] = { state: 'pending' };
  let pr;
  try { pr = Promise.resolve(p.f(p.arg)); } catch (e) { pr = Promise.reject(e); }
  pr.then(v => { window.__res[p.id] = { state: 'resolved', ms: Math.round(performance.now() - t0), value: v }; },
          e => { window.__res[p.id] = { state: 'rejected', ms: Math.round(performance.now() - t0), name: e && e.name, message: e && e.message }; });
};
document.getElementById('pw').addEventListener('submit', (e) => {
  if (window.__blockSubmit) { e.preventDefault(); window.__submitBlocked = (window.__submitBlocked || 0) + 1; }
});
document.getElementById('go').addEventListener('click', () => {
  const p = window.__pending; window.__pending = null; if (p) window.__start(p);
});
`;

function page({ banner = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>spike</title></head><body>
<h1>WebAuthn / DC spike</h1>
<p id="banner">${banner}</p>
<form id="pw" method="post" action="/login">
  <input id="username" name="username" type="text" autocomplete="username webauthn">
  <input id="password" name="password" type="password" autocomplete="current-password">
  <button id="signin" type="submit">Sign in</button>
</form>
<button id="go" type="button">Go</button>
<script>${PAGE_SCRIPT}</script>
</body></html>`;
}

export function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/login') {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        const user = new URLSearchParams(body).get('username') || '';
        // Pretend the password was right: redirect to a signed-in page (what a real RP does).
        res.writeHead(303, { Location: '/welcome?user=' + encodeURIComponent(user) });
        res.end();
      });
      return;
    }
    if (url.pathname === '/' || url.pathname === '/welcome') {
      const user = url.searchParams.get('user');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page({ banner: user ? 'Signed in as ' + user.replace(/[<>&"]/g, '') : '' }));
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
