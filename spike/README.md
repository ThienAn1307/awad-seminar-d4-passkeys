# Spike results: Chromium under Playwright automation for passkeys and the Digital Credentials API (2026-11-21)

A local experiment, not a literature review. Labels used throughout:
- **[OBS]**: observed in this run, reproducible with the script.
- **[INF]**: my inference from the observations. Not verified.

No Chromium source code was read for this spike. Every "why" below is [INF].

## 1. Environment and method

- OS: Windows 11 Home Single Language 10.0.26200, x64. Node v24.11.1. Playwright **1.65.1** (npm, exact version).
- Browsers, by `browser.version()`:

  | Config | Build | Launch |
  |---|---|---|
  | `shell` | chromium-headless-shell 159.0.8154.6 | `headless: true` (Playwright's default; built without Chrome's `//chrome` layer) |
  | `cft` | Chrome for Testing 159.0.8154.6 | `channel: 'chromium'`, new headless |
  | `chrome` | Google Chrome stable **157.0.8103.79** | `channel: 'chrome'`, new headless |
  | `cft-headed` | Chrome for Testing 159.0.8154.6 | `headless: false`; tests A, D and E only |

- Setup for every test:
  - Each browser had its own fresh temporary profile, and each test got a new BrowserContext.
  - The page was served by `node:http` at `http://localhost:<random port>`, with `rpId: "localhost"`.
  - Every WebAuthn or DC call ran inside a real click handler (`page.click`), unless a test says otherwise.
- Virtual authenticator, via `context.newCDPSession(page)`, then `WebAuthn.enable` (`{}` or `{enableUI:true}`), then `addVirtualAuthenticator` with `{protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, automaticPresenceSimulation:true}`.
- "Pending" means the call had not settled after 15 s. The harness then called `AbortController.abort()`, and every such call rejected with `AbortError`.
- Determinism:
  - Every config ran twice, each time in a separate browser launch (r1, r2). 313 result rows in total.
  - `node summarize.mjs --no-ms` compares the runs with timing fields removed. **Every test gave the same outcome in r1 and r2 in every config.** The only remaining differences are random IDs, and which account comes first in multi-account cases (see E2).
- Reproduce with `npm ci` and then `node run-spike.mjs` in this folder (about 26 min). `run-spike.mjs` hard-codes the Windows paths of Chrome stable and Playwright's headless shell (lines 34 and 35); change them on another machine.
  - Code: `run-spike.mjs` and `server.mjs` run the tests. `summarize.mjs` compares the runs.
  - Raw output is in `out/`: `log-2026-11-21T05-32-29-713Z.txt`, `results-2026-11-21T05-32-29-713Z.json`, and `protocol-{shell,cft,chrome}.json` (the `/json/protocol` of each build).
  - `out/smoke/` and `out/aborted-run/` hold the earlier runs, including the aborted one that used rpId `example.com` (section 5).

## 2. Verdict on conditional create (the disputed point)

**The evidence supports researcher 1's prediction and refutes researcher 2's.**

[OBS] A virtual authenticator was attached in 48 conditional-create calls: 6 variants × 4 configs × 2 runs. Not one of them produced a credential. `WebAuthn.getCredentials` stayed empty and no `credentialAdded` event fired. A modal create on the same authenticator succeeds every time (test B). So the authenticator itself works, and it is the conditional path that never reaches it.

| Setup | cft, chrome, cft-headed | shell |
|---|---|---|
| `enableUI` default (false) | **pending forever**. With `publicKey.timeout: 5000` it rejects at about 5.0 s with `NotAllowedError` | same |
| `enableUI: true` | **rejected at once** (3 to 22 ms; one outlier of 2296 ms) with `NotAllowedError` | pending (the flag has no effect here) |
| After a simulated password sign-in (form POST, then a 303 to `/welcome`) | same as the two rows above | same |
| USB transport authenticator | pending | pending |

The two claims, one by one:
- **Researcher 2** said that under automation conditional create "skips the eligibility check and succeeds". Half of this holds:
  - [OBS] With `enableUI` false the call is not rejected quickly. [INF] So the browser's eligibility check does seem to be skipped.
  - [OBS] But nothing then serves the request. It never succeeds, it only times out.
- **Researcher 1** said it is "rejected or never runs". Both halves were observed:
  - With `enableUI: true` it is rejected.
  - With the default it never runs.
- [INF] The fast `NotAllowedError` with `enableUI: true` fits Chrome's passkey-upgrade (Google Password Manager) path refusing a fresh profile: no Google account, and no saved password. I could not see which check failed.
- Not tested: whether a signed-in profile that has used a saved password within the last 5 minutes would succeed. A2's form submit did not save a password, because the save bubble needs a click in the browser's own UI.

Only Playwright's JavaScript shim makes conditional create "work":
- [OBS] With `context.credentials.install()`, `create({mediation:'conditional'})` resolved in every config.
- [OBS] The flags were `0x45`: UP=1, UV=1, AT=1, BE=0, BS=0. That is the same result as a modal create, so the shim ignores `mediation`.

## 3. Observed results (all configs, identical in r1 and r2 unless a config is named)

The long error message `NotAllowedError: The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.` is shortened to **NAE** below.

| Test | Observed |
|---|---|
| A1/A2/A3 conditional create | See section 2. Two more variants. A3a (no CDP, real environment): cft, chrome and headed gave NAE in 10 to 16 ms. shell gave `NotSupportedError: Resident credentials or empty 'allowCredentials' lists are not supported at this time.` A3b (`WebAuthn.enable` with no authenticator): pending. |
| A4 Playwright shim | conditional and modal create both resolved. Flags `0x45`, transports `["internal"]`. |
| B modal create, `enableUI` default | Resolved. Flags `0x45`: UP=1, UV=1, BE=0, BS=0, AT=1. signCount 1. `getCredentials`: 1 resident credential, `backupEligibility/backupState` false. `credentialAdded` fired. |
| B modal create, `enableUI:true` | cft and chrome: **pending**, 0 credentials (the browser dialog waits for a click Playwright cannot make). shell: resolved, as with the default. |
| C1 `signalUnknownCredential` | Resolved `undefined`, usually in about 10 ms (3 outliers: 110 ms, 761 ms and 1.4 s). A `credentialDeleted` event fired with the same ID (CDP sends standard base64; it matches after converting to base64url). `getCredentials` went from 1 to 0. |
| C2 `signalAllAcceptedCredentials(userId, [])` | Resolved, then `credentialDeleted`; 1 to 0. |
| C2b same, list `[k2]`, then `[]` | `[k2]`: k2 kept, another user's credential kept, no event. `[]`: k2 deleted, the other user's credential kept. |
| C2a two creates with the same `user.id` | The second **replaces** the first on the authenticator (1 credential left). |
| C3 `signalCurrentUserDetails` | Resolved, then `credentialUpdated`. userName/displayName went from `grace@example.test`/`grace@example.test` to `grace.renamed@example.test`/`Grace Renamed`. |
| C3b input errors | rpId `sub.localhost` gave `SecurityError: The relying party ID is not a registrable domain suffix of, nor equal to the current domain. Subsequently, an attempt to fetch the .well-known/webauthn resource of the claimed RP ID failed.` A malformed ID gave `TypeError: Failed to execute 'signalUnknownCredential' on 'PublicKeyCredential': Invalid base64url string for credentialId.` |
| C4 stale credential (server deleted it, nothing else on the authenticator) | **Without the signal**, `get()` returned the stale credential both times. **After** `signalUnknownCredential`, `get()` rejected with **NAE in 10 to 15 ms**: it did not stay pending, and with `timeout: 3000` it still rejected at about 14 ms, not at 3 s. |
| C5 stale (account 1) + valid (account 2) | Without the signal, `get()` returned the credential with the smaller ID (STALE in some runs, VALID in others). After the signal it returned VALID every time. |
| C6 Playwright shim plus signal | `signalUnknownCredential` resolved, but the shim **kept** the credential, and the next `get()` returned the stale credential again. |
| D `getClientCapabilities()` | Verbatim in section 6. The same in Chrome 157 and Chromium 159. `conditionalCreate: true` in **every** setup, even with no authenticator. Only `conditionalGet` and `userVerifyingPlatformAuthenticator` change: with no authenticator or a USB one, `conditionalGet` is false and `isConditionalMediationAvailable()` is false. |
| E1 conditional get, 1 credential, `enableUI` default | **Resolved with no interaction**, in 2 to 37 ms (once 269 ms). It was started from `page.evaluate`, with no user activation and no focus. Flags `0x05` (UP=1, UV=1). |
| E1b conditional get, 0 credentials, `enableUI` default | **NAE in 1 to 7 ms**; it did not stay pending. |
| E1 and E1b with `enableUI:true` | cft, chrome and headed: **pending**. Then came focus, click, typing "j", ArrowDown and Enter. The Enter reached the form's submit handler, so no autofill popup took it. shell: same as the default. |
| E2 modal get, 2 discoverable credentials | 8 fresh authenticators × 3 gets, every config and run. The credential with the **byte-wise smallest credential ID** came back 8/8 times; creation order did not matter. Both credentials fired `credentialAsserted` on every get, and both signCounts went up. |
| F0 feature detection | `DigitalCredential` is a function. `userAgentAllowsProtocol` exists and returned **true for every string**, including `'openid4vp-v1-unsigned'`, `'org-iso-mdoc'` and `'made-up-protocol'`. Prototype: `protocol`, `data`, `toJSON`. |
| F CDP domain | `DigitalCredentials.setVirtualWalletBehavior` exists in all 3 builds (experimental). Parameters (from `/json/protocol`): `action` (`respond`, `decline`, `wait` or `clear`), `protocol?`, `response?`, `frameId?`. `{}` gave `Invalid parameters`. `decline` with a protocol gave `Protocol and response are only allowed when action is 'respond'`. `Schema.getDomains` gave `'Schema.getDomains' wasn't found`. |
| F2 `respond` | `get()` resolved to a `DigitalCredential` with `protocol:'openid4vp-v1-unsigned'`, `id:''`, and `data` equal to the response object passed to CDP, unchanged. 1 to 25 ms. |
| F3 `decline` | `NotAllowedError: Request is cancelled.`, 4 to 40 ms. |
| F4 `wait` | Pending; aborting gave `AbortError`. |
| F5 `respond` with protocol `'openid4vp'` (the request asked for `openid4vp-v1-unsigned`) | Resolved with `protocol:'openid4vp'`: the virtual wallet **does not check** the protocol against the request. |
| F7 `clear`, F8 no CDP | Pending (the real provider; nothing visible in headless). |
| F9 one `respond`, two `get()` calls | Both resolved: the setting stays in force for later requests. |
| F10 `respond`, `get()` without a click | **Resolved** (1 to 4 ms): no user-activation check on this path. |
| H virtual authenticator capacity | **At most 3 resident credentials**: the 4th and 5th `create()` gave NAE in 2 to 15 ms. A non-resident create still worked. `WebAuthn.addCredential` could add a 4th. After `removeCredential` (4 to 3), the next resident create was still rejected. |

G, timing of 10 modal create+get pairs (credentials cleared between pairs; get uses `allowCredentials`):

| Config/run | create, in page, ms: median (min to max) | get, in page, ms | pair, Node wall clock, ms |
|---|---|---|---|
| shell r1 / r2 | 14 (13 to 32) / 11.5 (3 to 958) | 14 (13 to 18) / 12.5 (9 to 22) | 169 (155 to 185) / 289 (174 to 1365) |
| cft r1 / r2 | 12.5 (8 to 13) / 7.5 (3 to 382) | 12 (11 to 14) / 8 (3 to 12) | 170 (154 to 190) / 148 (107 to 627) |
| chrome r1 / r2 | 13 (9 to 15) / 13 (12 to 14) | 13.5 (8 to 14) / 14 (12 to 14) | 170 (158 to 204) / 165 (151 to 176) |

## 4. What this means for automating each API

**Conditional create (automatic passkey upgrade)**
- [OBS] The real Chromium path cannot be driven to success with the CDP virtual authenticator. The CDP `VirtualAuthenticatorOptions` have 16 fields, and none of them concerns passwords or upgrades.
- [OBS] `getClientCapabilities().conditionalCreate` is always true, so it says nothing about eligibility.
- [INF] The "change" arm needs a test double for `create({mediation:'conditional'})` that applies the documented gate and returns UP=0. Report it as simulated, as `conditional_create.md` section 5 already suggests.
- [OBS] Do not use the Playwright shim unchanged: it succeeds 100% of the time with UP=UV=1.
- [INF] A manual run in a signed-in Chrome is still the only way to see the real gate.

**Signal API**
- [OBS] Fully automatable and deterministic with CDP in all builds, Chrome 157 stable included. All three methods act on the virtual authenticator and emit `credentialDeleted` or `credentialUpdated`. The stale-credential failure reproduces: the stale credential comes back every time without the signal, and the next `get()` fails at once after it.
- [OBS] The Playwright shim ignores signals.
- Harness rules that follow from the observations:
  - At most 3 resident credentials per authenticator.
  - The same `user.id` overwrites the earlier credential.
  - With several accounts, the one returned is the smallest credential ID, which is random per run. [INF] Keep one credential per authenticator, use `allowCredentials`, or seed fixed IDs with `WebAuthn.addCredential`.
  - `credentialAsserted` fires for every matching credential, so identify the credential from the returned `id` instead.
- [INF] What it does not show: Google Password Manager's "hide" behaviour, or any provider UI.

**Conditional get (autofill sign-in; it bears on the step count)**
- [OBS] With `enableUI` false, conditional get acts like an instant modal get: it resolves with no focus and no click, and with no credentials it rejects at once instead of staying pending.
- [OBS] With `enableUI: true` it hangs, and page-level input could not drive the autofill UI.
- [INF] So the harness cannot observe autofill steps. Count them from a declared step model.

**Digital Credentials API**
- [OBS] Fully automatable on the RP side with `setVirtualWalletBehavior`, in all builds (headless shell and Chrome 157 stable included). `respond` passes the response through unchanged, `decline` gives `NotAllowedError "Request is cancelled."`, and `wait` stays pending (use `AbortController` for timeout tests).
- Limits [OBS]:
  - No protocol check (F5).
  - No user-activation check (F10), so the test cannot prove the RP needs a click.
  - The behaviour stays set until changed (F9).
  - `userAgentAllowsProtocol` is true for any string in these builds, so it is useless for feature detection here.
  - Without the virtual wallet, `get()` hangs.
- [INF] The wallet-side steps (chooser, consent, biometric) are not exercised and must be counted separately.

**Timing**
- [OBS] The API itself takes about 3 to 15 ms in the page. The Node-side pair time (about 150 to 290 ms) is mostly harness overhead (`page.evaluate`, click, 50 ms polling). There were occasional spikes of 150 to 960 ms, often on the first call in a browser.
- [INF] Do not report milliseconds as user effort. Discard a warm-up iteration, and report steps and success, not time.

## 5. What did not work, limits, and one mistake

- The Google Password Manager eligible state (signed in, saved password used within 5 minutes) could not be built in an automation profile, so that part of researcher 1's explanation is untested.
- Browser UI (`enableUI: true`) cannot be clicked by Playwright, and `page.screenshot` does not capture it. I could not see what the browser showed, if anything.
- The headless shell behaves differently from real Chrome: `enableUI` is ignored, and a create without CDP gives `NotSupportedError`. Use `channel: 'chromium'` or `'chrome'` for any claim about Chrome.
- Not covered:
  - Firefox and WebKit.
  - BE/BS through `defaultBackupEligibility`.
  - Pending cases beyond 15 s, other than A1t.
  - Whether Chromium also forwards signals to the Windows WebAuthn API: nothing visible happened, and the spike only ever passed IDs it had created itself.
- **Mistake, now fixed:** the first version of C3b used rpId `example.com`, so Chrome tried to fetch `https://example.com/.well-known/webauthn`. This happened 3 times: 2 smoke runs and r1 of an aborted full run, all from fresh profiles carrying no user data. I aborted the run, switched to `sub.localhost` (loopback), and re-ran everything. The final run makes no third-party requests by design, but I did not monitor the network to prove it.

## 6. Key raw log lines (Chrome stable 157, run 1; IDs and challenges trimmed)

```
[chrome r1] A A1 load-then-click, enableUI default => {"result":{"state":"pending after 15 s","afterAbort":{"state":"rejected","ms":15013,"name":"AbortError","message":"signal is aborted without reason"}},"credsOnAuthenticator":[],"cdpEvents":[]}
[chrome r1] A A1t load-then-click, enableUI default, publicKey.timeout=5000 => {"result":{"state":"rejected","ms":5019,"name":"NotAllowedError","message":"The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client."},"credsOnAuthenticator":[],"cdpEvents":[]}
[chrome r1] A A1 load-then-click, enableUI:true => {"result":{"state":"rejected","ms":9,"name":"NotAllowedError","message":"The operation either timed out or was not allowed. ..."},"credsOnAuthenticator":[],"cdpEvents":[]}
[shell r1] A A3a no CDP at all (real environment) => {"result":{"state":"rejected","ms":10,"name":"NotSupportedError","message":"Resident credentials or empty 'allowCredentials' lists are not supported at this time."}}
[chrome r1] B modal create, enableUI:false => {"result":{"state":"resolved","ms":11,"value":{"kind":"attestation","flags":{"byte":"0x45","UP":true,"UV":true,"BE":false,"BS":false,"AT":true,"ED":false,"signCount":1},"transports":["internal"]}},"cdpEvents":["credentialAdded"]}
[chrome r1] C C1 signalUnknownCredential(own cred) => {"signal":{"state":"resolved","ms":9,"value":"undefined"},"credsBefore":["wuYK..."],"credsAfter":[],"eventsAfterSignal":[{"ev":"credentialDeleted","credentialId":"wuYK..."}]}
[chrome r1] C C3 signalCurrentUserDetails => {"before":{"userName":"grace@example.test","userDisplayName":"grace@example.test"},"after":{"userName":"grace.renamed@example.test","userDisplayName":"Grace Renamed"},"eventsAfterSignal":[{"ev":"credentialUpdated","userName":"grace.renamed@example.test","userDisplayName":"Grace Renamed"}]}
[chrome r1] C C4 stale credential => {"get1":{"state":"resolved","returnedId":"NaXu...","serverKnows":false},"get2_noSignal":{"state":"resolved","returnedId":"NaXu...","serverKnows":false},"signal":{"state":"resolved"},"get3_afterSignal":{"state":"rejected","ms":14,"name":"NotAllowedError"},"get4_afterSignal_timeout3000":{"state":"rejected","ms":14,"name":"NotAllowedError"},"credsAfter":[]}
[chrome r1] E E1 conditional get, 1 credential, enableUI:false => {"resolvedAtStage":"no interaction","result":{"state":"resolved","ms":4,"value":{"kind":"assertion","flags":{"byte":"0x05","UP":true,"UV":true,"BE":false,"BS":false}}}}
[chrome r1] F F2 respond with test data, then get => {"cdp":[{"params":{"action":"respond","protocol":"openid4vp-v1-unsigned","response":{"vp_token":{"c1":["eyJ0eXAiOiJkYytzZC1qd3QifQ.test-not-a-real-credential~"]}}},"ok":true,"ret":{}}],"result":{"state":"resolved","ms":3,"value":{"ctor":"DigitalCredential","type":"digital","id":"","protocol":"openid4vp-v1-unsigned","data":{"vp_token":{"c1":["eyJ0eXAiOiJkYytzZC1qd3QifQ.test-not-a-real-credential~"]}}}}}
[chrome r1] F F3 decline, then get => {"result":{"state":"rejected","ms":4,"name":"NotAllowedError","message":"Request is cancelled."}}
[chrome r1] F F4 wait (never respond), then get => {"result":{"state":"pending after 15 s","afterAbort":{"state":"rejected","ms":15017,"name":"AbortError","message":"signal is aborted without reason"}}}
```

`getClientCapabilities()` verbatim (Chrome 157, no CDP):

```
{"conditionalCreate":true,"conditionalGet":true,"extension:appid":true,"extension:appidExclude":true,"extension:cmtgKey":false,"extension:credBlob":true,"extension:credProps":true,"extension:credentialProtectionPolicy":true,"extension:crossDeviceFallbackUrl":false,"extension:enforceCredentialProtectionPolicy":true,"extension:getCredBlob":true,"extension:hmacCreateSecret":true,"extension:largeBlob":true,"extension:minPinLength":true,"extension:payment":true,"extension:prf":true,"hybridTransport":true,"immediateGet":true,"passkeyPlatformAuthenticator":true,"relatedOrigins":true,"signalAllAcceptedCredentials":true,"signalCurrentUserDetails":true,"signalUnknownCredential":true,"userVerifyingPlatformAuthenticator":false}
```

How the other setups differ from that object:
- Internal virtual authenticator (with or without `enableUI`): only `"userVerifyingPlatformAuthenticator":true`.
- `WebAuthn.enable` with no authenticator, or a USB authenticator: only `"conditionalGet":false`.

Across all 40 D calls there were exactly these 3 distinct objects, the same in every build.
