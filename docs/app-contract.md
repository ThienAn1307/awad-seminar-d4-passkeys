# App đo cho D4: giao diện giữa app và harness

Trạng thái: nháp, chờ Hải xác nhận. Owner app: Hải. Owner harness và người viết file này: Ân. Thuộc: [docs/method.md](method.md).

## Mục tiêu

Một app đăng nhập nhỏ (mật khẩu và passkey autofill) mà harness điều khiển được, trong đó baseline và change chỉ khác nhau ở cờ `signal`.

## Ngoài phạm vi

- Giao diện đẹp, CSS. Trang chỉ cần đủ các phần tử ở mục Contract.
- Cơ sở dữ liệu, mã hoá phiên, HTTPS, CSRF. Dữ liệu nằm trong bộ nhớ; app chỉ chạy trên `127.0.0.1`.
- Khôi phục tài khoản, đổi mật khẩu, email.
- Conditional create (tự tạo passkey sau khi đăng nhập bằng mật khẩu): không có trong app (method.md A5).
- Nút passkey kiểu modal ở trang đăng nhập. Chỉ có autofill.
- Nhiều user đăng nhập cùng lúc. Harness chạy user tuần tự.

## Luồng (một phiên đăng nhập)

1. Harness mở `GET /signin`. Trang gọi `POST /api/signin/options`, rồi `startAuthentication({ optionsJSON, useBrowserAutofill: true })` (conditional get). `<body data-state="waiting">`.
2. **Conditional get resolve** → trang gửi `POST /api/signin/passkey`.
   - Server trả 200 → `data-state="signed-in"`.
   - Server trả 400 `unknown_credential` → nếu `labConfig.signal` là true, trang `await PublicKeyCredential.signalUnknownCredential({ rpId: 'localhost', credentialId })`. Sau đó `data-state="password"`.
3. **Conditional get reject** (`NotAllowedError`, autofill không có gì) → `data-state="password"`.
4. Harness điền `#username`, `#password`, click `#submit`. Trang gọi `POST /api/signin/password`; thành công → `data-state="signed-in"`.
5. Nếu `acceptedList` khác `off`, sau mỗi lần đăng nhập thành công trang `await PublicKeyCredential.signalAllAcceptedCredentials(...)` với danh sách server trả về, **trước** khi đặt `signed-in`.
6. Harness gọi `POST /api/signout`, rồi mở lại `/signin` **trong cùng tab** cho phiên sau. Virtual authenticator gắn với tab, nên không được mở tab mới.

Luật: mọi lời gọi signal phải được `await` xong trước khi đổi `data-state`, để harness đọc authenticator ngay sau đó là thấy kết quả.

## Contract

### Khởi động

- **Module:** `app/server.mjs` export `startApp({ signal = false, acceptedList = 'off', port = 0 })`, trả về `Promise<{ url, close }>`.
  - Server bind `127.0.0.1`.
  - `url` có dạng `http://localhost:<port>`.
  - Mỗi lần gọi là một store mới, rỗng.
  - `acceptedList` nhận `'off'`, `'correct'` hoặc `'incomplete'`.
- **CLI cho lần chạy tay:** `npm start` chạy `app/start.mjs` và đọc biến môi trường:
  - `SIGNAL=0|1`, mặc định 0;
  - `ACCEPTED_LIST`, mặc định `off`;
  - `PORT`, mặc định 3000.
- **Phiên bản cố định:** rpId `localhost`, origin `http://localhost:<port>`. Dùng `@simplewebauthn/server` 14.1.0 và `@simplewebauthn/browser` 14.0.0. Bản browser được serve từ `node_modules`, không dùng bundler, không thêm dependency.

### Trang `GET /signin`

- **Phần tử:**
  - `<input id="username" autocomplete="username webauthn">`;
  - `<input id="password" type="password" autocomplete="current-password">`;
  - `<button id="submit">`;
  - `<p id="message">`.
- **Cấu hình:** `<script>window.labConfig = { signal: <bool>, acceptedList: '<...>' }</script>`. Hai arm chỉ được khác nhau ở dòng này.
- **`document.body.dataset.state`** nhận một trong các giá trị `waiting`, `password`, `signed-in`, `error`. Mọi lỗi không lường trước đều đặt `error` và ghi tên lỗi vào `#message`.
- **`window.lab`:** khi phiên rời trạng thái `waiting`, object này có các trường sau.

```js
{
  autofill: 'credential' | 'none' | 'error',      // conditional get resolve, reject NotAllowedError, hay lỗi khác
  errorName: null | 'AbortError' | ...,
  credentialId: null | '<base64url>',              // id mà autofill trả về
  passkeyResult: null | 'ok' | 'unknown_credential' | 'verification_failed',
  signalled: [],                                   // các signal đã gọi xong, ví dụ ['unknownCredential'] hoặc ['allAcceptedCredentials']
  signalError: null | '<error name>',              // signal bị throw, hoặc trình duyệt không có API
  passwordResult: null | 'ok' | 'bad_credentials'  // sau khi submit mật khẩu
}
```

### Trang `GET /account` (chỉ dùng cho setup)

- **Khi đã đăng nhập:** trang có `window.lab.registerPasskey()`. Hàm này gọi `startRegistration` (modal create) và trả về `{ credentialId }`.
- **Khi chưa đăng nhập:** trang đặt `data-state="error"`.

### API

| Method và path | Request | Thành công | Lỗi |
|---|---|---|---|
| `POST /api/signin/options` | `{}` | 200 options JSON: `allowCredentials: []`, `userVerification: 'required'`, `timeout: 5000` | không có |
| `POST /api/signin/passkey` | `{ response: AuthenticationResponseJSON }` | 200 `{ username, userId, acceptedCredentialIds? }`, kèm cookie phiên | 400 `unknown_credential` (kèm `credentialId`); 400 `bad_challenge`; 400 `verification_failed` |
| `POST /api/signin/password` | `{ username, password }` | 200 như trên | 401 `bad_credentials` (sai mật khẩu, không có user, hoặc tài khoản chỉ có passkey) |
| `POST /api/signout` | không có | 204, xoá phiên | không có |
| `GET /api/me` | không có | 200 `{ username }` | 401 `not_signed_in` |
| `POST /api/register/options` | `{}` | 200 options JSON: `residentKey: 'required'`, `userVerification: 'required'`, `attestationType: 'none'`, `excludeCredentials` = các passkey của user | 401 `not_signed_in` |
| `POST /api/register/verify` | `{ response: RegistrationResponseJSON }` | 201 `{ credentialId }` | 400 `verification_failed`; 400 `bad_challenge`; 401 `not_signed_in` |

Chi tiết các trường:
- **`userId`:** base64url của 16 byte ngẫu nhiên, sinh lúc tạo user. Giá trị này là `user.id` khi đăng ký passkey.
- **`acceptedCredentialIds`:** chỉ có khi `acceptedList` khác `off`.
  - `correct` trả mọi credential ID của user.
  - `incomplete` trả mọi ID trừ credential đăng ký **sớm nhất**. Đây là bug cố ý mô phỏng, chỉ dùng cho probe.
- **Lỗi:** mọi response lỗi đều có dạng `{ "error": "<code>" }`.

### Endpoint chỉ dùng trong lab (`/lab/*`, không có auth vì chỉ bind 127.0.0.1)

| Method và path | Request | Thành công | Lỗi |
|---|---|---|---|
| `POST /lab/users` | `{ username, password: string \| null }` (`null` là tài khoản chỉ có passkey) | 201 `{ userId }` | 409 `username_taken`; 400 `invalid_input` |
| `POST /lab/session` | `{ username }` | 204, đặt cookie phiên (dùng cho setup, kể cả tài khoản không có mật khẩu) | 404 `not_found` |
| `GET /lab/users/:username` | không có | 200 `{ userId, hasPassword, credentialIds: [...] }`, theo thứ tự đăng ký | 404 `not_found` |
| `DELETE /lab/users/:username/credentials/:credentialId` | không có | 204. Server quên passkey này; đây là cách tạo nhóm `stale` | 404 `not_found` |

## Dữ liệu (trong bộ nhớ)

- **`users`:** `username → { userId, passwordHash | null, credentials: [{ id, publicKey, counter, transports, createdAt }] }`.
  - Mật khẩu băm bằng `scrypt` của `node:crypto`.
  - `credentials` giữ đúng thứ tự đăng ký.
- **`challenges`:** challenge đang chờ. Mỗi challenge **dùng một lần**, hết hạn sau 60 s, đánh dấu là đăng nhập hay đăng ký.
- **`sessions`:** `token → username`. Cookie `sid`, `HttpOnly`, `SameSite=Lax`.
- **Bất biến:** không có gì ngoài `labConfig` được phụ thuộc vào `signal`. Server không bao giờ xoá credential, trừ khi được gọi qua `/lab`.

## Lỗi

| Tình huống | User thấy | Hệ thống làm |
|---|---|---|
| Passkey không còn trên server | `#message`: "Passkey này không còn dùng được. Hãy đăng nhập bằng mật khẩu." | 400 `unknown_credential`; nếu `signal` thì gọi `signalUnknownCredential` |
| Challenge đã dùng hoặc quá 60 s | `#message` báo lỗi, `data-state="error"` | 400 `bad_challenge` |
| Chữ ký sai | như trên | 400 `verification_failed` |
| Sai mật khẩu, không có user, tài khoản không có mật khẩu | `#message`: "Sai tên đăng nhập hoặc mật khẩu", vẫn ở `password` | 401 `bad_credentials` |
| Đăng ký khi chưa đăng nhập | `/account` ở `error` | 401 `not_signed_in` |
| Trình duyệt không có Signal API (Firefox) hoặc signal throw | Như khi không có signal | `window.lab.signalError` = tên lỗi; vẫn sang `password` hoặc `signed-in` |
| Đăng ký lại trên authenticator đã có passkey của user | Lỗi `InvalidStateError` ở trang | Bị `excludeCredentials` chặn, không tạo trùng |
| Username trùng ở `/lab/users` | không có | 409 `username_taken` |

## Tiêu chí chấp nhận

API tests (`test/api/`, Hải) gọi `startApp` với port 0 và dùng `fetch`:
- **AC1.** Tạo `u1` với mật khẩu `pw-0123456789abc`, đăng nhập bằng mật khẩu đó → 200; `GET /api/me` với cookie trả về → 200 `{ username: 'u1' }`.
- **AC2.** Đăng nhập `u1` với mật khẩu sai → 401 `bad_credentials`.
- **AC3.** Tạo `p1` với `password: null`, rồi đăng nhập bằng mật khẩu bất kỳ → 401 `bad_credentials`.
- **AC4.** `POST /api/signin/passkey` với một assertion có `id` mà server không biết → 400 `{ error: 'unknown_credential', credentialId: <đúng id đó> }`.
- **AC5.** Dùng cùng một challenge hai lần → lần hai trả 400 `bad_challenge`.
- **AC6.** `POST /api/register/options` không có cookie → 401 `not_signed_in`.
- **AC7.** `POST /lab/users` hai lần cùng username → lần hai trả 409 `username_taken`.
- **AC8.** `DELETE` một credential ID không có → 404 `not_found`.
- **AC9.** `GET /signin` với `signal` true và false: hai HTML chỉ khác nhau ở dòng `window.labConfig`.

E2E (`test/e2e/`, Ân) chạy Playwright với virtual authenticator theo method.md section 3:
- **AC10.** User `valid`, cả hai arm → `autofill: 'credential'`, `passkeyResult: 'ok'`, `signed-in`.
- **AC11.** User `stale`, `signal` false, 2 phiên:
  - cả hai phiên đều `passkeyResult: 'unknown_credential'`, rồi `password`;
  - authenticator vẫn còn 1 credential.
- **AC12.** User `stale`, `signal` true:
  - phiên 1: `signalled: ['unknownCredential']`, authenticator còn 0 credential;
  - phiên 2: `autofill: 'none'`.
- **AC13.** `signal` true, nhưng `addInitScript` xoá `PublicKeyCredential.signalUnknownCredential` → `signalError` khác null, trang vẫn sang `password`, đăng nhập bằng mật khẩu thành công.
- **AC14.** Probe, user có hai passkey, `acceptedList` = `incomplete` → sau phiên 1 authenticator còn 0 credential. Với `correct` → vẫn còn 1.
- **AC15.** Sau khi đăng ký, `GET /lab/users/:username` trả `credentialIds` khớp với ID trên authenticator (CDP trả base64, đổi sang base64url rồi so).

## Ràng buộc

- Không thêm dependency ngoài `express`, `@simplewebauthn/server` và `@simplewebauthn/browser` (đã pin trong `package.json`).
- Node 24, ESM (`.mjs`), không TypeScript, không bundler.
- Phần code khác nhau giữa hai arm phải nằm gọn trong một nhánh `if (labConfig.signal)` ở `app/public/signin.js`.
- **Đã kiểm trong mã nguồn `@simplewebauthn/browser` 14.0.0, ngày 23/11:**
  - `startAuthentication({ useBrowserAutofill: true })` ném `Error('Browser does not support WebAuthn autofill')` nếu `isConditionalMediationAvailable()` false.
  - Hàm này cũng ném lỗi nếu không có input nào có `webauthn` trong `autocomplete`.
  - `NotAllowedError` từ trình duyệt được bọc trong `WebAuthnError`, nhưng `err.name` vẫn là `'NotAllowedError'`. Trang map lỗi theo `err.name`: `NotAllowedError` thành `autofill: 'none'`, mọi lỗi khác thành `autofill: 'error'`.
  - Theo spike (D), `isConditionalMediationAvailable()` là true khi có internal virtual authenticator, kể cả lúc nó không giữ credential nào.
- **Giả định (chưa kiểm):** Chrome trên trang `http://localhost` coi origin là secure context. Spike 21/11 đã chạy được trên đúng cấu hình này.
