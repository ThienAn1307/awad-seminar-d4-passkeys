Repo: https://github.com/ThienAn1307/awad-seminar-d4-passkeys

# Passkey cũ trong autofill: `signalUnknownCredential()` có giúp không?

CSC13114 SEMINAR, topic D4. Nhóm 23120018 Nguyễn Ngọc Thiên Ân, 23120031 Nguyễn Phú Dinh, 23120040 Hồ Hữu Hoàng Hải. Mọi số ở đây chép từ `results/2026-11-28T13-05-25-330Z/summary.json`, tức lần chạy chính thức trên commit `f1ab226`. Phương pháp được chốt trước khi có code, trong [docs/method.md](docs/method.md).

## 1. Câu hỏi

> When the server has deleted a passkey that the browser's password manager still offers in autofill, does calling `PublicKeyCredential.signalUnknownCredential()` after the first failed passkey sign-in raise the first-try sign-in success rate (% of later sign-ins) and cut sign-in steps (actions per sign-in), without lowering sign-in success for users whose passkeys are still valid?

**Trả lời:** có, trong lab. Ở user có passkey cũ, từ lần đăng nhập thứ hai, thành công ở lần thử đầu tăng **từ 0% lên 100%** và số thao tác giảm **từ 5 xuống 3 mỗi lần đăng nhập** (median của 5 run, 5/5 giống hệt). User có passkey hợp lệ không bị ảnh hưởng.

## 2. Setup

| | Giá trị (từ `env.json`) |
|---|---|
| Máy | Laptop Intel Core i5-8300H, Windows 11 (`Windows_NT 10.0.26200 x64`) |
| Phần mềm | Node `v24.11.1`, Playwright `1.65.1`, Chrome for Testing `159.0.8154.6` (new headless); app Express với `@simplewebauthn/server` 14.1.0 và `@simplewebauthn/browser` 14.0.0, bind `127.0.0.1`, rpId `localhost` [S12] |
| Authenticator | Virtual authenticator của CDP (`ctap2`, `internal`, resident key, UV); mỗi user một authenticator giữ đúng một passkey |
| Dữ liệu | 3 nhóm cố định × 10 user × 5 phiên đăng nhập. `stale`: authenticator còn passkey, server đã xoá. `valid` (đối chứng): passkey còn ở cả hai phía. `nopasskey`: chỉ có mật khẩu |
| Tải và run | User chạy tuần tự. Mỗi arm 5 run, thứ tự ABBA ABBA AB; mỗi run dùng app mới (store rỗng) và trình duyệt mới |

**Đếm thao tác.** Dưới automation, autofill không hiện UI, nên thao tác được tính theo mô hình khai báo trước (method.md mục 5): passkey được đề xuất là 2 thao tác (chọn, xác thực), đăng nhập bằng mật khẩu là 3 (username, mật khẩu, submit). Giả định user luôn chọn passkey được đề xuất và mỗi phiên thử passkey nhiều nhất một lần. **Headline** là nhóm `stale`, phiên 2 tới 5 (40 lần đăng nhập mỗi run); phiên 1 giống nhau ở hai arm vì signal chỉ được gọi sau lần thất bại đầu.

## 3. Baseline và change

Hai arm chạy cùng một app và chỉ khác nhau ở cờ `SIGNAL`. Phần code khác nhau là 3 dòng trong `app/public/signin.js`:

```js
if (window.labConfig.signal) {
  try { await PublicKeyCredential.signalUnknownCredential({ rpId: 'localhost', credentialId: response.id }); lab.signalled.push('unknownCredential'); } catch (err) { lab.signalError = err.name; }
}
```

Test `AC9` kiểm rằng HTML của trang `/signin` ở hai arm chỉ khác nhau đúng dòng `window.labConfig`.

**Giữ cố định** (ghi trong `env.json`): bản trình duyệt và Playwright; options của authenticator; code app trừ cờ `SIGNAL`; danh sách user, mật khẩu 16 ký tự, setup từng nhóm; mô hình bước; timeout 5 s cho mọi lời gọi WebAuthn; rpId, origin và máy đo.

## 4. Kết quả

| Nhóm `stale`, phiên 2 tới 5 | Thành công ở lần thử đầu (% lần đăng nhập) | Thao tác mỗi lần đăng nhập |
|---|---|---|
| baseline (`SIGNAL=0`) | 0 (min–max 0–0, 5/5 giống hệt) | 5 (5–5, 5/5 giống hệt) |
| change (`SIGNAL=1`) | **100** (100–100, 5/5 giống hệt) | **3** (3–3, 5/5 giống hệt) |

Theo từng phiên, mỗi ô ghi % thành công ở lần thử đầu / thao tác mỗi lần; mọi run giống nhau:

| Nhóm, arm | Phiên 1 | Phiên 2 | Phiên 3 | Phiên 4 | Phiên 5 | Thành công chung |
|---|---|---|---|---|---|---|
| `stale`, baseline | 0 / 5 | 0 / 5 | 0 / 5 | 0 / 5 | 0 / 5 | 100% |
| `stale`, change | 0 / 5 | 100 / 3 | 100 / 3 | 100 / 3 | 100 / 3 | 100% |
| `valid`, cả hai arm | 100 / 2 | 100 / 2 | 100 / 2 | 100 / 2 | 100 / 2 | 100% |
| `nopasskey`, cả hai arm | 100 / 3 | 100 / 3 | 100 / 3 | 100 / 3 | 100 / 3 | 100% |

Baseline đề xuất passkey cũ ở mọi phiên: user chọn nó (2 thao tác), server trả `unknown_credential`, rồi user gõ mật khẩu (3 thao tác). Ở change, signal ở phiên 1 làm authenticator còn 0 credential, nên từ phiên 2 autofill không đề xuất gì nữa. Ràng buộc vẫn giữ: thành công chung 100% ở mọi nhóm, nhóm `valid` không đổi. Số đo trùng dự đoán đã ghi trước (method.md mục 7).

**Probe: `signalAllAcceptedCredentials` với danh sách thiếu.** 10 user có hai passkey, "laptop" và "điện thoại". Server cố ý bỏ ID của laptop khỏi danh sách. Số là median của 5 run, 5/5 giống hệt.

| Biến thể | Passkey laptop bị xoá | Lockout | Phiên 2–5: thành công lần đầu / thao tác |
|---|---|---|---|
| danh sách đúng, còn mật khẩu hoặc chỉ có passkey | 0% | 0% | 100% / 2 |
| danh sách thiếu, còn mật khẩu | 100% | 0% | 100% / 3 |
| danh sách thiếu, chỉ có passkey | **100%** | **100%** | 0% / không còn cách đăng nhập |

**Kiểm chéo:** cùng lệnh trên CI ubuntu (GitHub Actions, Linux, commit `6607839`, code app và harness giống `f1ab226`) ra đúng các số trên, 30/30 lần chạy `ok` (`results/ci-ubuntu/2026-11-28T13-32-18-423Z/`). WSL Ubuntu trên cùng laptop, từ một bản clone sạch, cũng ra đúng các số này (`results/wsl-ubuntu/2026-11-28T13-31-36-481Z/`). CROSSCHECK_TODO

## 5. Khuyến nghị

<!-- NHÁP của Ân theo dàn ý H3. Hải đọc lại, sửa, rồi xoá dòng này. -->

**Nên gọi `signalUnknownCredential()` ngay khi server trả `unknown_credential`.**

- **Lợi ích.** Ở user có passkey cũ, mỗi lần đăng nhập về sau bớt 2 bước vô ích, và lần thử đầu luôn thành công. Không thấy tác dụng phụ: nhóm `valid` và `nopasskey` giữ nguyên số.
- **Cost.** 3 dòng ở client, không thêm dependency, không đổi server. Độ phủ trình duyệt: Chrome desktop từ 132 [S3], Chrome Android từ 144 [S4], Safari 26 [S5]; Firefox chưa có [S6], và ở đó trang chỉ ghi `signalError` rồi cư xử như baseline (test `AC13`). Thời gian (`ms`) có trong file raw nhưng không lên headline, vì lab chạy trên localhost.
- **Khi nào không nên dùng.**
  - *`signalAllAcceptedCredentials` với danh sách không chắc đầy đủ.* Probe cho thấy một danh sách thiếu xoá passkey hợp lệ ở 100% user, và làm 100% tài khoản chỉ có passkey bị lockout. Spec cảnh báo credential vắng mặt "will be removed or hidden, potentially irreversibly" [S2]. Chrome cũng cảnh báo "passing an empty list can hide all of the user's passkeys" [S8].
  - *Khi server chưa chắc credential đã mất*, ví dụ database lỗi tạm thời. Signal không báo kết quả ("signal methods do not indicate whether the operation succeeded" [S1]), nên xoá nhầm thì không biết và không hoàn tác được. Đây là suy luận từ spec, nhóm không đo.
  - *Khi đây là cách đăng nhập duy nhất.* Signal chỉ bỏ một đề xuất sai, nó không cứu tài khoản. Vẫn phải giữ mật khẩu hoặc một luồng khôi phục.

## 6. Giới hạn

<!-- NHÁP của Ân. Hải thêm kết quả lần chạy tay (H2) rồi xoá dòng này. -->

- **Virtual authenticator không phải password manager.** Signal *xoá* credential khỏi virtual authenticator (spike, test C1). Google Password Manager *ẩn* passkey và khôi phục được [S4], Apple thì xoá [S7]. Ẩn hay xoá thì autofill đều thôi đề xuất, nên hiệu ứng có lẽ như nhau, nhưng chưa đo. Lần chạy tay trên Chrome thật: LAN_CHAY_TAY.
- **Thao tác là mô hình, không quan sát được.** Nếu user thật học được cách bỏ qua passkey cũ, baseline sẽ tốn ít hơn 5 thao tác và khoảng cách giữa hai arm hẹp lại.
- **Mỗi authenticator chỉ có một passkey.** Trường hợp passkey cũ nằm lẫn với passkey hợp lệ không được đo. Khi có nhiều passkey, virtual authenticator trả passkey có ID nhỏ nhất (spike, test E2), còn autofill thật hiện danh sách.
- **Chỉ một bản Chromium, user tổng hợp.** Spread bằng 0 là thật với hệ xác định này, nhưng không nói gì về biến thiên ngoài đời. Domain CDP `WebAuthn` vẫn là experimental [S11].
- **Điều sẽ đổi kết quả.** Password manager bỏ qua signal (Firefox, Chrome cũ hơn 132) thì change y hệt baseline. Kết quả cũng đổi khi có thêm một passkey hợp lệ được đề xuất, hoặc khi user không chọn passkey được đề xuất.

## 7. Conditional create và Digital Credentials API: có nguồn, không đo

- **Conditional create** bật mặc định trên Chrome desktop từ 136 [S9], nhưng không tự động hoá được dưới CDP: `npm run check:conditional-create` tạo được 0/5 passkey với `enableUI` false và 0/5 với `enableUI` true, trong khi đối chứng bằng modal create trên cùng authenticator tạo được 5/5 (`results/conditional-create/2026-11-28T13-17-23-815Z/`). Spike ngày 21/11 cũng ra 0/48. Vì vậy nhóm không đo nó, và app không mời tạo passkey sau khi đăng nhập bằng mật khẩu.
- **Digital Credentials API** là W3C Working Draft [S10]. Nhóm không đo vì không có ví hay credential thật.

## 8. Nguồn

<!-- Dinh kiểm lại từng dòng (D1); dòng nào đã đọc lại thì đổi ngày đọc thành 2026-11-28. -->

Tất cả đọc ngày 2026-11-21. Số liệu ngành (FIDO, Microsoft, Google) không được dùng, vì không so được với lab.

| # | Fact | Nguồn |
|---|---|---|
| S1 | WebAuthn Level 3 là W3C Recommendation (25/08/2026); Signal API ở section 5.1.10; "signal methods do not indicate whether the operation succeeded" | [W3C TR webauthn-3](https://www.w3.org/TR/webauthn-3/#sctn-signal-methods) |
| S2 | Credential vắng mặt trong `signalAllAcceptedCredentials` "will be removed or hidden, potentially irreversibly" | [W3C TR webauthn-3](https://www.w3.org/TR/webauthn-3/) |
| S3 | Chrome desktop: Signal API "Enabled by default" từ 132, stable ngày 2025-01-14 | [chromestatus](https://chromestatus.com/feature/5101778518147072), [Chromium Dash M132](https://chromiumdash.appspot.com/fetch_milestone_schedule?mstone=132) |
| S4 | Chrome Android có Signal API từ 144; Google Password Manager ẩn passkey thay vì xoá, khôi phục được | [Chrome blog: Signal API on Android](https://developer.chrome.com/blog/signal-api-android) |
| S5 | Safari 26: "Added support for the WebAuthn Signal API" | [Safari 26 Release Notes](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) |
| S6 | Firefox chưa hiện thực (bug 2039672, NEW) | [Bugzilla 2039672](https://bugzilla.mozilla.org/show_bug.cgi?id=2039672) |
| S7 | Apple: "will delete any passkeys they have that aren't in the set" | [WWDC25 session 279](https://developer.apple.com/videos/play/wwdc2025/279/) |
| S8 | "passing an empty list can hide all of the user's passkeys" | [Chrome for Developers: Signal API](https://developer.chrome.com/docs/identity/webauthn-signal-api) |
| S9 | Conditional create "Enabled by default" trên Chrome desktop từ 136 | [chromestatus](https://chromestatus.com/feature/5135710007590912) |
| S10 | Digital Credentials API là W3C Working Draft (19/11/2026) | [W3C TR digital-credentials](https://www.w3.org/TR/digital-credentials/) |
| S11 | Domain CDP `WebAuthn` là `experimental domain` | [WebAuthn.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/WebAuthn.pdl) |
| S12 | Playwright 1.65.1 đi kèm Chrome for Testing 159.0.8154.6 (khớp `env.json`); `@simplewebauthn/browser` 14.0.0, `@simplewebauthn/server` 14.1.0 | [browsers.json v1.65.1](https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/packages/playwright-core/browsers.json), [npm browser](https://registry.npmjs.org/@simplewebauthn/browser), [npm server](https://registry.npmjs.org/@simplewebauthn/server) |
