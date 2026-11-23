# Phương pháp đo (viết trước khi có code)

File này chốt câu hỏi, cách đo và dự đoán **trước** khi viết app và harness. Nếu code hay số đo về sau khác file này, sửa file này trong một commit riêng và ghi lý do. Không sửa ngầm.

## 1. Câu hỏi

Câu đã ghi ở dòng D4 của sheet đăng ký:

> When the server has deleted a passkey that the browser's password manager still offers in autofill, does calling `PublicKeyCredential.signalUnknownCredential()` after the first failed passkey sign-in raise the first-try sign-in success rate (% of later sign-ins) and cut sign-in steps (actions per sign-in), without lowering sign-in success for users whose passkeys are still valid?

Bối cảnh: một site đang chuyển user từ mật khẩu sang passkey. Server có thể xoá một passkey, ví dụ khi user gỡ nó ở trang tài khoản trên máy khác, hay khi dọn dữ liệu. Trình duyệt không biết việc đó, nên autofill vẫn đề xuất passkey cũ. Mỗi lần user chọn nó, đăng nhập thất bại và user phải quay về mật khẩu. Signal API (WebAuthn Level 3) cho site báo lại cho trình duyệt rằng credential này không còn.

## 2. Baseline và change

Hai arm chạy **cùng một app**. Chúng khác nhau đúng một thứ: cờ `SIGNAL`.

| Arm | `SIGNAL` | Khi server trả lỗi `unknown_credential` |
|---|---|---|
| baseline | `0` | Trang báo lỗi rồi chuyển sang form mật khẩu. |
| change | `1` | Trang gọi `PublicKeyCredential.signalUnknownCredential({ rpId, credentialId })`, rồi làm y như baseline. |

Phần code khác nhau phải nằm gọn trong một nhánh `if (SIGNAL)` ở client. Không được có khác biệt nào khác trong code, dữ liệu hay môi trường; danh sách những gì giữ cố định nằm ở section 10.

## 3. Hệ thống đo

- **App:** Express với `@simplewebauthn/server` 14.1.0 và `@simplewebauthn/browser` 14.0.0. App bind `127.0.0.1`, port động, rpId `localhost`, origin `http://localhost:<port>`. Dữ liệu nằm trong bộ nhớ và mất khi server tắt.
- **Trang đăng nhập:**
  - ô `username` có `autocomplete="username webauthn"`, một ô mật khẩu và nút submit;
  - khi trang tải xong, nó gọi conditional get (`mediation: 'conditional'`, `timeout: 5000`).
- **Trình duyệt:** Playwright 1.65.1 (pin cứng) với Chrome for Testing 159.0.8154.6, new headless (`channel: 'chromium'`). Không dùng headless shell, vì spike 21/11 cho thấy nó cư xử khác Chrome. Không dùng shim `context.credentials` của Playwright, vì nó bỏ qua signal.
- **Authenticator:** mỗi user tổng hợp có một BrowserContext riêng và một virtual authenticator CDP riêng. Options: `{ protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }`, gọi `WebAuthn.enable` với `enableUI` mặc định (false). Mỗi authenticator giữ đúng một passkey của user đó, nên không gặp giới hạn 3 credential hay chuyện "credential có ID nhỏ nhất được trả về".
- **Mạng:** `page.route` chặn và ghi log mọi request không tới `localhost`. Log này phải rỗng thì run mới hợp lệ.

Spike 21/11 đã kiểm trên đúng bản build này (log trong `spike/`):
- **Có passkey trên authenticator:** conditional get resolve không cần thao tác nào, trong 2 tới 37 ms.
- **Không có passkey:** conditional get reject với `NotAllowedError` trong 1 tới 7 ms, không treo.
- **Sau `signalUnknownCredential`:** CDP bắn `credentialDeleted` và authenticator còn 0 credential.

## 4. User tổng hợp (3 nhóm cố định)

Mỗi nhóm có 10 user và mỗi user đăng nhập 5 phiên. Không có yếu tố ngẫu nhiên nào quyết định user thuộc nhóm nào.

| Nhóm | Setup (không tính vào số đo) | Trên authenticator | Trên server |
|---|---|---|---|
| `stale` | Tạo tài khoản có mật khẩu, đăng ký passkey bằng modal create qua app, rồi server xoá bản ghi passkey | 1 passkey | Không có passkey nào |
| `valid` (đối chứng) | Như trên, nhưng không xoá | 1 passkey | Có passkey đó |
| `nopasskey` | Tạo tài khoản có mật khẩu, từ chối lời mời tạo passkey | 0 | Không có |

- **Username:** `stale01` tới `stale10`, `valid01` tới `valid10`, `nopass01` tới `nopass10`. Username trong cùng một nhóm dài bằng nhau.
- **Mật khẩu:** cố định, 16 ký tự, giống nhau giữa hai arm.
- **Setup:** chạy giống hệt nhau ở hai arm và không được tính vào số đo.

## 5. Một phiên đăng nhập và mô hình bước

Harness không nhìn thấy được UI autofill: khi `enableUI` là false, conditional get tự resolve. Vì vậy số thao tác được **tính theo mô hình đã khai báo dưới đây**, dựa trên sự kiện mà harness quan sát được. 1 thao tác là một trong các việc: điền một ô, một click, chọn một mục autofill, một cử chỉ UV.

Các bước của một phiên:
1. Mở `/signin` trong **cùng tab** của user. Mỗi virtual authenticator CDP gắn với một tab; mở tab mới thì authenticator không còn. User đang ở trạng thái đăng xuất.
2. Trang gọi conditional get. Có hai khả năng:
   - **Resolve với một credential** nghĩa là autofill có đề xuất passkey. Tính **+2** (chọn mục autofill, cử chỉ UV). Gửi assertion tới server.
     - Server chấp nhận: đăng nhập thành công. Phiên kết thúc.
     - Server trả `unknown_credential`: lần thử đầu thất bại. Ở arm change, trang gọi `signalUnknownCredential`. Sau đó sang bước 3.
   - **Reject với `NotAllowedError`** nghĩa là autofill không đề xuất gì. Sang bước 3.
   - **Không settle trong 5 s:** đây là lỗi harness, đánh dấu run `status: "error"`.
3. Đăng nhập bằng mật khẩu: điền username (+1), điền mật khẩu (+1), click submit (+1). Số phím gõ cộng thêm độ dài username và mật khẩu.
4. Ghi kết quả, đăng xuất. Trước và sau phiên, ghi danh sách credential trên authenticator (`WebAuthn.getCredentials`).

Kết quả mô hình cho mỗi kiểu phiên:

| Kiểu phiên | Thao tác | Lần thử đầu thành công |
|---|---|---|
| Passkey hợp lệ được đề xuất | 2 | có |
| Passkey cũ được đề xuất, thất bại, rồi dùng mật khẩu | 5 | không |
| Không có đề xuất, dùng mật khẩu | 3 | có |

**Giả định hành vi:**
- **A1.** Autofill đề xuất passkey thì user luôn chọn nó.
- **A2.** Mỗi phiên user thử passkey nhiều nhất một lần. Thất bại thì dùng mật khẩu và không thử lại passkey.
- **A3.** User gõ mật khẩu, không có mật khẩu đã lưu nào được autofill. Giả định này giống nhau ở hai arm.
- **A4.** UV tính là một cử chỉ, dù là vân tay, khuôn mặt hay PIN.
- **A5.** Sau khi đăng nhập bằng mật khẩu, app không mời tạo passkey mới. Phần đó là conditional create, không đo được bằng automation (spike: 0/48), xem section 11.

## 6. Metric

Mỗi metric tính theo từng arm, từng nhóm, từng phiên k = 1..5.

| Metric | Đơn vị | Định nghĩa |
|---|---|---|
| Thành công ở lần thử đầu | % đăng nhập | Số user đăng nhập được bằng cách thử đầu tiên trong phiên, chia cho số user |
| Thao tác | thao tác/lần đăng nhập | Trung bình số thao tác theo mô hình ở section 5 |
| Số phím gõ | phím/lần đăng nhập | Metric phụ, log riêng |
| Đăng nhập thành công chung | % đăng nhập | User kết thúc phiên ở trạng thái đã đăng nhập |
| Số lần thất bại | lần/user | Tổng số lần thử thất bại qua 5 phiên |
| Thời gian | ms | Metric phụ, không lên headline |

**Headline:** nhóm `stale`, gộp các phiên 2 tới 5, tức 40 lần đăng nhập mỗi run. Headline gồm hai số: % thành công ở lần thử đầu và số thao tác/lần đăng nhập. Phiên 1 giống nhau ở hai arm vì signal chỉ được gọi sau lần thất bại đầu tiên. Nếu gộp cả phiên 1, con số sẽ phụ thuộc vào số phiên K: với K = 5 ra (K−1)/K = 80%, một con số do thiết kế đo tạo ra chứ không do signal. Bảng đủ 5 phiên vẫn được báo cáo.

**Ràng buộc** (phải đúng thì mới khuyến nghị dùng change):
- tỉ lệ đăng nhập thành công chung giữ 100% ở cả ba nhóm;
- nhóm `valid` ở arm change không thấp hơn baseline ở metric nào.

## 7. Dự đoán (ghi trước khi đo)

| Nhóm | Arm | Phiên 1 | Phiên 2 tới 5 |
|---|---|---|---|
| `stale` | baseline | 5 thao tác, 0% | 5 thao tác, 0% |
| `stale` | change | 5 thao tác, 0% | **3 thao tác, 100%** |
| `valid` | cả hai | 2 thao tác, 100% | 2 thao tác, 100% |
| `nopasskey` | cả hai | 3 thao tác, 100% | 3 thao tác, 100% |

Nếu số đo khác bảng này, phải tìm nguyên nhân và ghi vào REPORT. Không sửa mô hình cho khớp số.

## 8. Probe: `signalAllAcceptedCredentials` với danh sách thiếu

Đây là câu hỏi phụ cho phần "khi nào không nên dùng". Probe báo cáo riêng, không vào headline.

- **Ai:** 10 user mới, mỗi user có hai passkey:
  - passkey trên authenticator đang dùng ("laptop");
  - passkey đăng ký từ một context khác lúc setup ("điện thoại").
- **Khi nào gọi:** sau mỗi lần đăng nhập thành công, trang gọi `signalAllAcceptedCredentials({ rpId, userId, allAcceptedCredentialIds })` với danh sách server trả về.
- **Biến thể** (2 × 2):
  - danh sách **đúng** (cả hai ID) hoặc **thiếu** (chỉ ID "điện thoại", mô phỏng bug của server);
  - tài khoản **còn mật khẩu** hoặc **chỉ có passkey**.
- **Đo:**
  - % user mà passkey hợp lệ bị xoá khỏi authenticator;
  - thao tác và thành công ở lần thử đầu cho các phiên sau;
  - **% lockout**: user không còn đăng nhập được bằng cách nào.

Dự đoán:
- Danh sách thiếu xoá passkey hợp lệ ở 100% user.
- User còn mật khẩu đi từ 2 lên 3 thao tác.
- User chỉ có passkey bị lockout 100% từ phiên 2. Luồng khôi phục nằm ngoài phạm vi đo.

## 9. Run và spread

- **Số run:** mỗi arm 5 run, xếp theo thứ tự ABBA ABBA AB, tổng 10 lần chạy. Mỗi lần chạy dùng server mới (port mới) và trình duyệt mới. User chạy tuần tự.
- **Một lệnh:** `npm run measure` chạy cả hai arm và probe, rồi ghi vào `results/<timestamp>/`:
  - `env.json`: phiên bản Node, Playwright và trình duyệt, OS, commit hash, thứ tự chạy, options của authenticator;
  - `executions.json`: trạng thái từng lần chạy (`ok` hoặc `error`, kèm lý do);
  - `raw/<n>-<study>-<arm>.jsonl`: một file thô cho mỗi lần chạy, mỗi dòng là một phiên;
  - `summary.json`, sinh ra từ các file thô.
- **Probe:** mỗi biến thể cũng chạy 5 lần. Thứ tự các biến thể xoay vòng qua từng run, cùng lý do với ABBA.
- **Spread:** báo "median, min tới max" qua 5 run. Nếu 5 run giống hệt nhau thì ghi rõ "5/5 giống hệt"; spread 0 là kết quả thật của một hệ xác định, không giấu đi. Phần ổn định được kiểm thêm bằng cách chạy trên 3 máy của nhóm và trên CI ubuntu.
- **Lỗi:**
  - Mọi lời gọi WebAuthn có timeout 5 s.
  - Run lỗi vẫn giữ log, đánh dấu `status: "error"` và không được tính vào median.
  - Còn dưới 5 run hợp lệ mỗi arm thì lệnh thoát với mã khác 0.

## 10. Giữ cố định

Giống nhau ở cả hai arm và mọi run, và được ghi vào `env.json`:
- bản build trình duyệt và Playwright;
- options của authenticator;
- code app, trừ cờ `SIGNAL`;
- danh sách user, độ dài username và mật khẩu;
- setup của từng nhóm;
- mô hình bước;
- timeout 5 s;
- rpId và origin.

## 11. Giới hạn biết trước

- **Virtual authenticator không phải Google Password Manager.** Spike cho thấy signal *xoá* credential khỏi virtual authenticator. GPM thật có thể chỉ *ẩn* credential. Lần chạy tay ở section 12 kiểm điều này, nhưng nằm ngoài headline.
- **Thao tác được tính theo mô hình, không quan sát được.** Các giả định A1 tới A5 quyết định con số tuyệt đối. Hiệu ứng của signal thì chỉ phụ thuộc vào việc autofill còn đề xuất passkey cũ hay không.
- **Chỉ Chromium.** Firefox chưa hỗ trợ Signal API. Safari 26 có hỗ trợ nhưng không đo.
- **User tổng hợp, hệ xác định.** Spread 0 không nói gì về biến thiên ngoài đời thực.
- **Conditional create và Digital Credentials API không đo.** `npm run check:conditional-create` tái tạo kết quả 0/N của spike để làm bằng chứng. Hai API này được trình bày như finding có nguồn.

## 12. Lần chạy tay (Chrome thật, có GPM)

- **Mục đích:** kiểm xem kết quả trên virtual authenticator có đúng với Chrome thật có Google Password Manager không.
- **Làm:** một người, trên profile Chrome của chính mình, dùng đúng app này ở `http://localhost`:
  1. đăng ký passkey;
  2. xoá nó trên server;
  3. đăng nhập 2 lần với `SIGNAL=0`;
  4. đăng ký lại và làm như trên với `SIGNAL=1`.
- **Ghi lại:** quay màn hình, đếm thao tác, chụp `chrome://password-manager` trước và sau. Lưu vào `results/manual/`.
- **Chưa biết:** GPM có lưu passkey cho `http://localhost` không. Nếu không, ghi lại đúng điều đó.
