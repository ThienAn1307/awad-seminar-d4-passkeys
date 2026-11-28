# Kiểm lại nguồn của REPORT mục 8

Người kiểm: Nguyễn Phú Dinh (23120031). Mọi dòng đọc lại ngày 2026-11-28, khoảng 21:40 (giờ VN). Lần đọc trước: 2026-11-21.

Kết quả: **11 dòng OK, 1 dòng ĐỔI (S10)**. Dòng ĐỔI chỉ ảnh hưởng ngày ghi trong bảng mục 8; mục 7 chỉ nói "W3C Working Draft" nên vẫn đúng.

| # | Link | Đọc | Kết quả | Câu trên trang hiện nay |
|---|---|---|---|---|
| S1 | https://www.w3.org/TR/webauthn-3/#sctn-signal-methods | read 2026-11-28 | **OK** | "W3C Recommendation, 25 August 2026". Mục "5.1.10. Signal Credential Changes to the Authenticator - PublicKeyCredential's signal methods". Có nguyên văn "signal methods do not indicate whether the operation succeeded" |
| S2 | https://www.w3.org/TR/webauthn-3/ | read 2026-11-28 | **OK** | Mục 5.1.10.3: "Note: Credentials not present in allAcceptedCredentialIds will be removed or hidden, potentially irreversibly." |
| S3 | https://chromestatus.com/feature/5101778518147072 và https://chromiumdash.appspot.com/fetch_milestone_schedule?mstone=132 | read 2026-11-28 | **OK** | Feature "WebAuthn signal API", desktop "Enabled by default", milestone 132. `"stable_date":"2025-01-14T00:00:00"` |
| S4 | https://developer.chrome.com/blog/signal-api-android | read 2026-11-28 | **OK** | "Starting with Chrome 144, the Signal API is available on Chrome for Android." "Now, Google Password Manager hides the passkey instead of deleting it." "If the signal was sent in error, the passkey can be restored." |
| S5 | https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes | read 2026-11-28 | **OK** | "Added support for the WebAuthn Signal API. (134729866)" |
| S6 | https://bugzilla.mozilla.org/show_bug.cgi?id=2039672 | read 2026-11-28 | **OK** | "[meta] Implement web authentication signal methods", status NEW, chưa có resolution, sửa lần cuối 2026-10-28 |
| S7 | https://developer.apple.com/videos/play/wwdc2025/279/ | read 2026-11-28 | **OK** | "When you do this, credential managers will delete any passkeys they have that aren’t in the set of what you provided." |
| S8 | https://developer.chrome.com/docs/identity/webauthn-signal-api | read 2026-11-28 | **OK** | "For example, passing an empty list can hide all of the user's passkeys." |
| S9 | https://chromestatus.com/feature/5135710007590912 | read 2026-11-28 | **OK** | Feature "Web Authentication Conditional Create (Automatic Passkey Upgrades)", desktop "Enabled by default", milestone 136 |
| S10 | https://www.w3.org/TR/digital-credentials/ | read 2026-11-28 | **ĐỔI** | "W3C Working Draft 28 November 2026" (REPORT ghi 19/11/2026). Trạng thái vẫn là Working Draft, chỉ ngày đổi. Bản hôm nay: https://www.w3.org/TR/2026/WD-digital-credentials-20261128/ |
| S11 | https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/WebAuthn.pdl | read 2026-11-28 | **OK** | `experimental domain WebAuthn` |
| S12 | https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/packages/playwright-core/browsers.json, https://registry.npmjs.org/@simplewebauthn/browser, https://registry.npmjs.org/@simplewebauthn/server | read 2026-11-28 | **OK** | chromium `"revision": "1255"`, `"browserVersion": "159.0.8154.6"`. `@simplewebauthn/browser` có bản 14.0.0, `@simplewebauthn/server` có bản 14.1.0 |

## Ghi chú

- **S10.** Trang `/TR/digital-credentials/` luôn trỏ tới bản nháp mới nhất, và lịch sử W3C cho thấy bản mới ra ngày 19, 23, 25, 27 và 28/11. Vì vậy ngày sẽ còn đổi. Đề xuất: bỏ ngày trong cột Fact, hoặc dẫn thẳng link có ngày của bản đã đọc.
- **S3, S9.** Trang chromestatus dựng bằng JavaScript; nội dung đọc qua `https://chromestatus.com/api/v0/features/<id>`. Cùng record của S3 ghi Android từ 144, khớp với S4.
- **S5.** Trang Apple dựng bằng JavaScript; nội dung đọc qua bản JSON của chính trang đó (`/tutorials/data/documentation/safari-release-notes/safari-26-release-notes.json`).
- **S6.** Đọc qua `https://bugzilla.mozilla.org/rest/bug/2039672`.
- **S7.** Trang dùng dấu nháy cong (aren’t), REPORT dùng dấu nháy thẳng (aren't). Chữ giống hệt.
- **S8.** Cũng trang này còn câu cũ nói Safari "not yet implemented" (trang cập nhật lần cuối 29/11/2024), trái với S5. REPORT không trích câu đó.

## Rà mục 1 tới 7: câu về phiên bản, ngày, trạng thái hay API mà thiếu `[S#]`

- Mục 6, gạch đầu dòng cuối: "Password manager bỏ qua signal (Firefox, Chrome cũ hơn 132)". Thiếu nguồn, nên thêm `[S6]` và `[S3]`.
- Không thấy câu nào khác. Các số Node, Playwright, Chrome for Testing ở mục 2 lấy từ `env.json`, kèm `[S12]`.
