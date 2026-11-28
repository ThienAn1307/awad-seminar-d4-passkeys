# Passkey cũ trong autofill: `signalUnknownCredential()` có giúp không?

CSC13114 SEMINAR, topic D4 (Passkeys: conditional create, the Signal API; the Digital Credentials API). Nhóm 23120018, 23120031, 23120040.

- Câu hỏi, cách đo và dự đoán: [docs/method.md](docs/method.md), viết trước khi có code.
- Kết quả và khuyến nghị: [REPORT.md](REPORT.md).
- Giao diện giữa app và harness: [docs/app-contract.md](docs/app-contract.md).

## Chạy lại phép đo từ một bản clone sạch

Cần Node 24 (xem `.nvmrc`) và mạng cho lần cài đầu tiên. Lệnh đo chạy khoảng 10 tới 12 phút trên một laptop i5-8300H.

```sh
git clone https://github.com/ThienAn1307/awad-seminar-d4-passkeys.git
cd awad-seminar-d4-passkeys
npm ci
npx playwright install chromium
npm run measure
```

Trên Linux, thay `npx playwright install chromium` bằng `npx playwright install --with-deps chromium`.

Lệnh `npx playwright install chromium` tải đúng bản Chrome for Testing đi kèm Playwright 1.65.1 (pin cứng trong `package.json`). Không cần tài khoản, key hay passkey thật: harness dùng virtual authenticator của Chrome DevTools Protocol, app chạy ở `127.0.0.1`, và mọi request ra ngoài `localhost` đều bị chặn và ghi log.

`npm run measure` chạy cả hai arm, mỗi arm 5 lần theo thứ tự ABBA, rồi chạy probe. Cuối cùng nó in ra các số sau (lấy từ lần chạy ngày 28/11):

```
baseline: stale cohort, sessions 2-5: first try 0 (0 to 0, 5/5 identical) %, 5 (5 to 5, 5/5 identical) actions/sign-in; valid runs 5, errors 0
change: stale cohort, sessions 2-5: first try 100 (100 to 100, 5/5 identical) %, 3 (3 to 3, 5/5 identical) actions/sign-in; valid runs 5, errors 0
probe correct, with password: passkey deleted 0 (0 to 0, 5/5 identical) %, lockout 0 (0 to 0, 5/5 identical) %
probe correct, passkey only: passkey deleted 0 (0 to 0, 5/5 identical) %, lockout 0 (0 to 0, 5/5 identical) %
probe incomplete, with password: passkey deleted 100 (100 to 100, 5/5 identical) %, lockout 0 (0 to 0, 5/5 identical) %
probe incomplete, passkey only: passkey deleted 100 (100 to 100, 5/5 identical) %, lockout 100 (100 to 100, 5/5 identical) %
results: results/<timestamp>
```

Cách đọc: số đầu là median của 5 run, trong ngoặc là min tới max. Hệ đo xác định nên 5 run cho cùng một số. Lệnh thoát với mã khác 0 nếu một arm hay một biến thể probe có ít hơn 5 run hợp lệ.

## Kết quả nằm ở đâu

Mỗi lần chạy ghi vào một thư mục mới `results/<timestamp>/`:

| File | Nội dung |
|---|---|
| `env.json` | Node, Playwright, bản trình duyệt, OS, CPU, commit, working tree có sạch không, thứ tự chạy, options của authenticator: những gì giữ cố định |
| `executions.json` | Trạng thái từng lần chạy (`ok` hay `error`, kèm lý do) |
| `raw/<nn>-<study>-<arm>.jsonl` | Dữ liệu thô, mỗi dòng là một phiên đăng nhập của một user |
| `summary.json` | Mọi số trong REPORT và slides, tính lại từ các file `raw/` |

Các lần chạy nhóm đã báo cáo đều nằm trong `results/` của repo. Lần chạy chính thức, nguồn của mọi số trong REPORT, là `results/2026-11-28T13-05-25-330Z/` (commit `f1ab226`).

## Bằng chứng conditional create không tự động hoá được

```sh
npm run check:conditional-create
```

Lệnh chạy khoảng 30 giây và ghi vào `results/conditional-create/<timestamp>/`. Kết quả mong đợi: `create({ mediation: 'conditional' })` tạo được 0/5 lần, cả với `enableUI` false lẫn true; lần đối chứng bằng modal create tạo được 5/5.

## Test và lint

```sh
npm test            # unit (mô hình bước, metric) và API của app (AC1 tới AC9)
npm run test:e2e    # app và harness trong Chrome for Testing (AC10 tới AC15)
npm run lint
```

## Chạy app bằng tay

```sh
npm start           # http://localhost:3000/signin
```

Biến môi trường: `SIGNAL=0|1` (mặc định 0), `ACCEPTED_LIST=off|correct|incomplete` (mặc định `off`), `PORT` (mặc định 3000). Trên PowerShell, ví dụ: `$env:SIGNAL='1'; npm start`.

## Biến chỉ dùng khi phát triển

Không dùng các biến này cho số đã báo cáo:
- `RUNS`, `USERS`: số run và số user mỗi nhóm (mặc định 5 và 10);
- `ONLY=main|probe`: chỉ chạy một phần;
- `HEADED=1`: mở cửa sổ trình duyệt để xem.

Ví dụ chạy thử nhanh: `RUNS=1 USERS=1 npm run measure`, khoảng 20 giây.

## Khi gặp lỗi

- **`Executable doesn't exist` hoặc Playwright báo thiếu trình duyệt:** chạy lại `npx playwright install chromium`.
- **Node cũ hơn 24:** `package.json` đòi `node >= 24`; cài Node 24 rồi chạy lại `npm ci`.

## Cấu trúc repo

| Đường dẫn | Nội dung |
|---|---|
| `app/` | App Express đăng nhập bằng mật khẩu và passkey autofill. Cờ `SIGNAL` là khác biệt duy nhất giữa hai arm |
| `harness/` | Phép đo: user tổng hợp, mô hình bước, chạy ABBA, tính metric |
| `test/` | Unit, API và e2e |
| `results/` | Raw output của mọi lần chạy đã báo cáo |
| `spike/` | Thử nghiệm ngày 21/11 về cách Chromium cư xử dưới automation; xem [spike/README.md](spike/README.md) |
| `docs/` | Phương pháp, contract của app |
