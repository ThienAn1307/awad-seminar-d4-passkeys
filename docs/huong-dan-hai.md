# Hướng dẫn Hải: app và phần trình bày seminar D4

Tài liệu giải thích phần app được triển khai theo [contract](app-contract.md) và [phương pháp đo](method.md). Đây là tài liệu học và chuẩn bị trình bày, không phải REPORT chính thức hay kết quả đo cuối cùng.

## 1. Vấn đề và câu hỏi

Server có thể xoá một passkey trong khi authenticator của trình duyệt vẫn giữ bản tương ứng. Khi đăng nhập, autofill vẫn có thể đưa ra passkey cũ. Trình duyệt tạo assertion nhưng server không tìm thấy credential và trả `unknown_credential`; người dùng cần dùng mật khẩu.

Nhóm hỏi: sau lần lỗi đầu tiên, gọi `PublicKeyCredential.signalUnknownCredential()` có thay đổi các lần đăng nhập tiếp theo không? Nhóm so sánh tỷ lệ thành công ngay lần thử đầu và số thao tác, đồng thời kiểm tra nhóm có passkey hợp lệ. Hai arm dùng cùng app, chỉ đổi `SIGNAL`. Đây là thí nghiệm trên user tổng hợp và virtual authenticator, không phải đo người dùng thật.

## 2. Sơ đồ app

```text
Harness / trình duyệt                    App Express (localhost)
  /lab/users, /lab/session ------------> users và sessions trong bộ nhớ
  /account -> startRegistration -------> options -> verify -> lưu public key
  /signin -> conditional get ----------> options -> passkey verify
                |                         |
                | credential không còn   | unknown_credential
                v                         v
        SIGNAL bật: signalUnknownCredential
                |
        fallback sang mật khẩu ----------> password verify
```

- `app/server.mjs`: tạo Express server và các API; mỗi lần `startApp` tạo bộ nhớ độc lập.
- `app/start.mjs`: đọc `SIGNAL`, `ACCEPTED_LIST`, `PORT` để chạy thủ công.
- `app/public/signin.js`: điều phối conditional get, xử lý signal, form mật khẩu và trạng thái mà harness quan sát.
- `app/public/account.js`: đăng ký passkey qua SimpleWebAuthn. Hàm `window.lab.registerPasskey()` được harness gọi khi setup.
- `test/api/app.test.mjs`: AC1–AC9; `test/e2e/signin.e2e.test.mjs`: AC10–AC15 do harness và app chạy cùng Chrome for Testing.

Server bind `127.0.0.1`; URL sử dụng `localhost` vì rpId là `localhost`. Dữ liệu không tồn tại sau khi server dừng. Đây là ứng dụng phục vụ lab, không phải mẫu triển khai production.

## 3. Dữ liệu và các bước xác thực

`users` ánh xạ username tới user ID ngẫu nhiên, salt và hash mật khẩu hoặc `null`, cùng danh sách credential. Mật khẩu được băm bằng `scrypt`; phép so sánh dùng `timingSafeEqual`. Danh sách credential lưu ID, public key, counter và transports do SimpleWebAuthn trả về; không lưu private key. Thứ tự thêm vào danh sách quan trọng cho probe.

`sessions` ánh xạ token ngẫu nhiên tới username. Cookie `sid` có `HttpOnly` và `SameSite=Lax`. `/lab/session` tạo phiên trực tiếp để chuẩn bị dữ liệu thí nghiệm; endpoint này chỉ phù hợp cho lab localhost.

`challenges` lưu challenge đang chờ, loại đăng ký hay đăng nhập, user cho đăng ký và thời điểm hết hạn. `consume` đọc challenge từ `clientDataJSON`, kiểm tra loại, user và hạn, rồi xoá nó. SimpleWebAuthn kiểm tra challenge, origin, rpId, thông tin authenticator và chữ ký trong quá trình verify; bản thân việc đọc challenge không phải xác thực chữ ký.

## 4. Đăng ký passkey

1. Harness tạo user và phiên qua `/lab/users` và `/lab/session`, rồi mở `/account`.
2. `registerPasskey()` gọi `/api/register/options`. Server yêu cầu resident key và user verification, cấp challenge và trả `excludeCredentials` từ các credential đã lưu.
3. `startRegistration` gọi WebAuthn trong trình duyệt; authenticator tạo khoá và trả response.
4. `/api/register/verify` tiêu thụ challenge và gọi `verifyRegistrationResponse`. Nếu hợp lệ, server lưu credential và trả ID cho harness.

Hai thiết bị trong probe là hai context và authenticator riêng. User ID server giữ giống nhau, còn credential được đăng ký riêng cho mỗi thiết bị.

## 5. Đăng nhập và Signal API

Trang `/signin` gọi `/api/signin/options`, sau đó `startAuthentication` với `useBrowserAutofill: true`. Ô username có `autocomplete="username webauthn"`. Khi lấy được assertion, trang gửi response lên `/api/signin/passkey`.

- Nếu ID tồn tại, server kiểm tra bằng `verifyAuthenticationResponse`, cập nhật counter và tạo phiên.
- Nếu ID không tồn tại, server trả `unknown_credential` và ID đó. Trong nhánh `if (window.labConfig.signal)`, client chờ `signalUnknownCredential({ rpId, credentialId })`, rồi chuyển sang form mật khẩu. Nếu Signal API không có hoặc ném lỗi, client ghi `signalError` và vẫn cho đăng nhập bằng mật khẩu.
- Nếu conditional get trả `NotAllowedError`, trang chuyển sang mật khẩu. Lỗi không dự kiến đưa trang sang `error`.

`window.lab` ghi lại các kết quả để harness quan sát. `data-state` cho harness biết trang đang `waiting`, `password`, `signed-in` hay `error`. Signal được `await` trước khi đổi trạng thái để harness không đọc authenticator quá sớm.

## 6. Probe danh sách thiếu

Probe là một thí nghiệm riêng với `signalAllAcceptedCredentials`: sau đăng nhập, server trả danh sách credential được chấp nhận. `correct` trả đủ; `incomplete` cố ý bỏ credential được đăng ký đầu tiên. Khi danh sách thiếu, authenticator có thể loại credential vẫn hợp lệ. Với tài khoản chỉ có passkey, điều này có thể dẫn đến lockout trong mô hình lab. Không được suy ra rằng mọi password manager ngoài thực tế đều xử lý giống virtual authenticator.

## 7. Kiểm thử và cách kiểm tra lại

Chạy `npm ci`, `npx playwright install chromium`, sau đó `npm test`, `npm run lint` và `npm run test:e2e`. Phép đo chính thức là `npm run measure` với cấu hình mặc định của phương pháp; lưu đầy đủ raw, environment và summary. Một lần chạy với `RUNS=1`, `USERS=1` chỉ là smoke test, không dùng làm số headline của seminar.

| AC | Kiểm tra | File |
|---|---|---|
| AC1–AC3 | Mật khẩu, phiên, sai mật khẩu và tài khoản chỉ passkey | `test/api/app.test.mjs` |
| AC4–AC6 | Credential lạ, challenge một lần và quyền đăng ký | `test/api/app.test.mjs` |
| AC7–AC9 | Username trùng, xoá ID thiếu, HTML hai arm | `test/api/app.test.mjs` |
| AC10–AC13 | Passkey hợp lệ, stale, signal và fallback | `test/e2e/signin.e2e.test.mjs` |
| AC14–AC15 | Danh sách đúng/thiếu và đối chiếu credential ID | `test/e2e/signin.e2e.test.mjs` |

## 8. Gợi ý trình bày phần của Hải

1. Nhắc câu hỏi: passkey đã bị xoá ở server nhưng vẫn xuất hiện trên thiết bị; sau lần lỗi đầu, signal có thay đổi lần đăng nhập tiếp theo không?
2. Chiếu bảng từ `results/<timestamp>/summary.json` của bộ đo chính thức: so sánh theo từng nhóm và phiên. Nêu đơn vị, median và min–max như plan. Không dùng dự đoán hoặc smoke test thay cho số đo.
3. Giải thích probe danh sách thiếu và phân biệt nó với phép so sánh chính.
4. Đưa khuyến nghị theo số đo và giới hạn: user tổng hợp, virtual authenticator, chỉ Chromium và mô hình thao tác. Kết quả chạy tay GPM chỉ bổ sung nếu Dinh đã lưu bằng chứng.

## 9. Câu hỏi có thể gặp

**Vì sao cần hai arm giống nhau?** Để khác biệt quan sát được trong lab có thể gắn với việc bật/tắt signal, thay vì thay đổi đồng thời giao diện hay dữ liệu.

**Server có xoá private key không?** Không. Server xoá credential phía server; authenticator quản lý private key. Signal là yêu cầu trình duyệt cập nhật trạng thái credential phía nó.

**Vì sao `await` signal?** Harness đo authenticator sau khi trang đổi trạng thái. Nếu không đợi, phép đọc có thể xảy ra trước khi tín hiệu được xử lý.

**Vì sao vẫn cần mật khẩu?** Trong nhóm stale, lần đầu passkey thất bại. Mật khẩu là fallback trong phương pháp này; nhóm không xây dựng email OTP.

**Probe chứng minh gì?** Probe kiểm tra tác động của danh sách chấp nhận thiếu trong cấu hình lab. Nó không chứng minh mọi triển khai thực tế đều xoá hoặc khoá tài khoản như nhau.

**Kết quả này đại diện cho người dùng thật không?** Không trực tiếp. User và hành vi thao tác được mô hình hoá; kết quả cần được diễn giải với các giới hạn đó.
