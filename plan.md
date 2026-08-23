# Kế hoạch sửa (review 2026-08-19)

Bối cảnh: PTMatch chưa launch, đang ở giai đoạn kiểm chứng nhu cầu — mục tiêu
vẫn là ≥30 lead/tháng với CPL <50k trước khi tin rằng chợ có cầu. Kế hoạch này
chỉ chứa việc phục vụ trực tiếp mục tiêu đó, không thêm tính năng mới.

> **Cập nhật hướng đi (2026-08-19):** không seed hồ sơ thủ công nữa. Kế hoạch
> mới là public site lên các group Facebook cho **cả PT lẫn học viên tự đăng
> ký, tự điền**. Điều đó đổi thứ tự ưu tiên: công cụ admin tạo hồ sơ hộ PT gần
> như không cần, còn luồng tự phục vụ (vai trò OAuth, quên mật khẩu, onboarding
> ngắn) thành chặn launch — đã làm xong, xem bên dưới.

**Trạng thái (2026-08-20):** nhóm A (phần code), B, C đã làm xong và đã chạy
thật (**181 test backend pass**, `next build` xanh, kiểm chứng end-to-end trên
stack dev). Phần code gần như không còn gì chặn launch. Đã review lại toàn
repo trước lần deploy đầu (mục review bên dưới, R1-R24) — **20/24 đã sửa xong**
kể cả migration DB (`0016` thu hồi phiên khi đổi mật khẩu, `0017` index khu
vực). Còn mở: **R14** (xoay credential — việc vận hành, không phải code),
**R23** (Zalo OA refresh token — cần credential thật để thử, chưa làm mù);
**R21** hoá ra là false positive, đã kiểm và ghi chú lại.

**Nút thắt duy nhất còn lại là TÊN MIỀN** — xem mục ngay dưới. Nó chặn email,
chặn OAuth production, chặn hộp thư liên hệ trên trang pháp lý. Mọi thứ khác
đều chờ nó hoặc chờ bên thứ ba duyệt.

---

## 🔍 Review toàn repo trước deploy (2026-08-20)

Rà lại toàn bộ repo (backend API/bảo mật, backend services/jobs/migration,
frontend, hạ tầng deploy) trước lần lên prod đầu tiên. Mỗi mục dưới đây **đã
đọc lại code thật để xác minh**, không phải suy đoán. Sắp theo mức chặn.

### ⛔ CHẶN DEPLOY — phải sửa trước khi mở cho người lạ

**Cả 5 mục dưới đã sửa (2026-08-20), 171 test backend pass (thêm 9 test mới
cho các guard/whitelist này).**

- [x] **R1. XSS lưu trữ qua file upload phục vụ same-origin `/media`.**
      `services/storage.py:28-32` lấy đuôi file từ **tên client gửi lên**
      (`_EXT_RE` cho cả `.html`, `.svg`, `.js`); `is_allowed_content_type`
      (`storage.py:20-21`) chỉ kiểm **header** bắt đầu bằng `image/`/`video/`.
      `STORAGE_BACKEND=local` là mặc định prod (`.env:103`, `config.py:78`) và
      `main.py:79-85` mount `/media` bằng `StaticFiles` — Content-Type suy ra
      **từ đuôi file**. Kịch bản: user đã đăng nhập PUT
      `/api/upload/local/uploads/<id>/x.svg` header `Content-Type: image/svg+xml`
      (qua được prefix `image/`) với thân chứa `<script>`, hoặc `x.html` header
      `image/png`; file được phục vụ ở `https://<domain>/media/...` đúng origin
      chính → chạy script tùy ý (chiếm phiên, CSRF admin). `nosniff` **không đỡ**
      vì type là *khai báo qua đuôi*, không phải đoán; CSP chỉ có `frame-ancestors`.
      **Đã sửa:** `storage.py` đổi sang whitelist tường minh
      `CONTENT_TYPE_EXTENSIONS` (jpg/png/webp/gif/mp4/webm/mov — **bỏ hẳn SVG**),
      đuôi file giờ suy từ content-type đã duyệt (`build_object_key` nhận
      content-type, không nhận filename nữa). `upload_local` (điểm ghi thật, có
      thể bị PUT trực tiếp không qua `/presign`) thêm kiểm
      `extension_matches_content_type()`: đuôi trong key phải khớp đúng
      content-type khai báo, chặn cả hai hướng tấn công (khai type giả hoặc tự
      chọn đuôi giả). 5 test mới ở `test_storage.py`/`test_api.py`.

- [x] **R2. Rate limit bị vô hiệu vì `X-Forwarded-For` do client tự đặt.**
      `nginx/conf.d/ptmatch.conf:96` dùng `$proxy_add_x_forwarded_for` (**nối
      thêm** IP thật vào sau header client gửi), còn uvicorn chạy
      `--forwarded-allow-ips *` (`entrypoint.sh`, `docker-compose.prod.yml`) nên
      middleware proxy-headers tin **entry trái nhất** = giá trị kẻ tấn công đặt.
      `ratelimit.py:7-11` key theo IP đó. Kịch bản: brute-force
      `/api/auth/admin/login` (định mức 5/phút cho tài khoản admin duy nhất) bằng
      cách đổi `X-Forwarded-For` ngẫu nhiên mỗi request → không giới hạn. Cùng lỗ
      cho `/auth/login`, `/auth/forgot-password` (bom email), `/leads`,
      `/reviews`. Ngược lại, đặt XFF = IP nạn nhân để **khoá** họ. Sửa: nginx ghi
      đè `proxy_set_header X-Forwarded-For $remote_addr;` (hoặc key limiter theo
      `X-Real-IP` mà nginx đã set đúng ở dòng 95).
      **Đã sửa:** `ptmatch.conf` đổi thành ghi đè `$remote_addr` — nginx là cổng
      vào duy nhất (backend/frontend không lộ ra ngoài) nên đây luôn là IP
      client thật, client không còn chèn được entry giả vào đầu chuỗi.

- [x] **R3. nginx crash-loop lần boot đầu vì cert chưa tồn tại → kẹt cả script
      cài đặt.** Block 443 (`ptmatch.conf:47-48`) trỏ thẳng
      `/etc/letsencrypt/live/<domain>/fullchain.pem` — chưa có lúc boot đầu; nginx
      `[emerg]` rồi crash-loop dưới `restart: unless-stopped`, cổng 80 không bao
      giờ trả lời. Trong `setup-server.sh:138`, `up -d nginx || log...` coi như
      "thành công" (chỉ chặn lỗi *tạo* container), rồi `certbot certonly --webroot`
      (dòng 146) fail vì HTTP-01 không tới được; `set -euo pipefail` (dòng 16)
      dừng script → **bước 5 không chạy: mất cron gia hạn cert, cron backup, cron
      nhắc lead**. Comment ngay trong file đã thừa nhận đây là hack thủ công.
      Sửa: ship một conf HTTP-only bootstrap (hoặc self-signed tạm) tới khi có
      cert thật lần đầu.
      **Đã sửa:** `setup-server.sh` dựng cert tự ký 1 ngày đúng đường dẫn
      `certbot/conf/live/<domain>/` trước khi `up -d --no-deps nginx` (chỉ kéo
      nginx, không kéo backend/frontend theo `depends_on` — image có thể chưa
      sẵn sàng lúc này); xoá cert tự ký trước khi gọi `certbot certonly` (tránh
      certbot tạo lineage phụ kiểu `<domain>-0001`); sau khi có cert thật thì
      `nginx -s reload` rồi mới `up -d` full stack.

- [x] **R4. Cron chạy theo giờ UTC → nhắc lead lúc 2-4h sáng VN.**
      `setup-server.sh:180-183` cài `0 7-21 * * *` (comment: "không chạy ban đêm
      để PT khỏi tắt thông báo"), nhưng **không** đặt `CRON_TZ` và không có
      `timedatectl set-timezone` ở đâu (đã grep: chỉ `timeutils.py` cho stats
      dùng giờ VN). Image GCE/Ubuntu mặc định UTC → 7-21 UTC = **14:00-04:00
      ICT**: tin nhắn Zalo/email đập vào máy PT lúc 2, 3, 4h sáng — đúng hành vi
      spam mà docstring nói sẽ khiến PT tắt thông báo. Sửa:
      `CRON_TZ=Asia/Ho_Chi_Minh` trong `/etc/cron.d/ptmatch`, hoặc
      `timedatectl set-timezone Asia/Ho_Chi_Minh` trong setup.
      **Đã sửa:** cả hai — `CRON_TZ=Asia/Ho_Chi_Minh` ở đầu `/etc/cron.d/ptmatch`
      (lưới chính) và `timedatectl set-timezone Asia/Ho_Chi_Minh` trong
      `setup-server.sh` trước khi ghi file cron (lưới dự phòng nếu cron
      package nào đó không đọc `CRON_TZ`).

- [x] **R5. Deploy mặc định gửi thông báo lead vào hư không, còn ghi là "sent".**
      `.env.example:43` để `NOTIFY_CHANNELS=log`; `setup-server.sh:88-112` chép
      `.env.example` và viết lại secret/domain nhưng **không đụng** `NOTIFY_CHANNELS`
      / `SMTP_*` (chỉ log nhắc ở dòng 112). `LogChannel` trả `ok=True`
      (`channels/log.py`) nên chain dừng ở đó, `notification_deliveries` ghi
      `status='sent', channel='log'`, `lead_reminders` tiêu luôn `reminder_sent_at`
      — mọi thứ trông khoẻ trong khi **không PT nào được báo**. `config.py:92-148`
      đã hard-fail prod với `SECRET_KEY` yếu / GCS bucket trống, nhưng **không có**
      guard tương tự đòi ít nhất một kênh thật ở production. *(Đây là mặt vận hành
      của mục A2 đã có — nhưng R5 nhấn: nên chặn boot, không chỉ nhắc.)*
      **Đã sửa:** thêm guard `_reject_log_only_notify_channels_in_production` vào
      `config.py` cùng nhóm với guard `SECRET_KEY`/`STORAGE_BACKEND` — production
      với `NOTIFY_CHANNELS` chỉ có `log` (hoặc rỗng) giờ **từ chối khởi động**,
      không chỉ log nhắc. Dev không bị ảnh hưởng (mặc định `log` vẫn chạy được
      ngay sau khi clone). `setup-server.sh` cũng đổi dòng log cuối thành
      "BẮT BUỘC" thay vì "Tuỳ chọn". 4 test mới ở `test_config.py`.

### ⚠️ NÊN SỬA SỚM — không chặn boot nhưng hỏng trải nghiệm / tăng bán kính rủi ro

- [ ] **R6. Nhãn i18n thô lộ ra UI ở 2 chỗ.**
      (a) `dashboard/analytics/page.tsx:179` gọi `t(bar.key)` với `bar.key` =
      `leads_new/…`, nhưng namespace `analytics` chỉ có `new/contacted/closed/lost`
      (đã có sẵn `labelKey` đúng nhưng không dùng) → PT thấy `analytics.leads_new`
      làm nhãn phễu. (b) `dashboard/profile/page.tsx:594` gọi `t(label)` với
      `label` = "Facebook"/… không có trong `profileEditor` → hiện
      `profileEditor.Facebook`. Sửa (a) dùng `bar.labelKey`; (b) render `label`
      thẳng (tên thương hiệu, không cần dịch).

- [ ] **R7. Form đăng ký nhận mật khẩu 6 ký tự, backend đòi 8 → lỗi pydantic
      tiếng Anh thô ngay đầu phễu.** `register/page.tsx:56` kiểm `< 6` và
      `messages/vi.json` ghi "ít nhất 6 ký tự"; backend `schemas/auth.py:10` đòi
      `min_length=8`. User nhập 7 ký tự → qua client, backend trả "String should
      have at least 8 characters" (tiếng Anh, qua `parseError`). Reset-password
      đã đúng (8). Sửa: đổi client + copy sang 8.

**Cả 6 mục (R8-R13) dưới đây đã sửa (2026-08-20), 181 test backend pass.**

- [x] **R8. Upload không rate limit, không quota → user đăng nhập có thể lấp đầy
      đĩa.** `api/upload.py` — presign và PUT local **không** `@limiter.limit`
      (mọi endpoint ghi khác đều có), không đếm dung lượng/người. Trên server đơn
      30GB, `/media` chung đĩa với Postgres (`docker-compose.prod.yml:81`) → một
      tài khoản lặp PUT 10MB làm đầy đĩa, Postgres chết trước. GCS presign cũng
      thiếu `x-goog-content-length-range` nên vượt 10MB. Ngoài ra **không có
      đường xoá** avatar/portfolio cũ khi thay → rác tích luỹ cả khi dùng thật.
      **Đã sửa:** `@limiter.limit("20/minute;100/hour")` trên cả `/presign` và
      `/local/{key}`; `presign_gcs()` ký kèm `x-goog-content-length-range` (0-10MB)
      và trả về trong `headers` để PUT thật mang theo — thiếu quota-per-user vẫn
      còn (không làm, xem "chưa làm" bên dưới), nhưng rate limit + trần dung
      lượng GCS đã chặn kịch bản lấp đĩa bằng một tài khoản.
- [x] **R9. `lead_reminders` commit một lần cuối vòng lặp → crash giữa chừng gửi
      lại toàn bộ.** `jobs/lead_reminders.py:54-78` set `reminder_sent_at` trong
      ORM nhưng `db.commit()` chỉ ở dòng 78. Nếu tiến trình chết ở lead thứ N (VD
      deploy restart container backend mà cron `exec` vào), **cả N reminder đã gửi
      bị bỏ đánh dấu** → lượt sau gửi lại cả loạt (không phải "trùng một lần" như
      comment). Không có lock chống hai lượt chồng nhau. Sửa: commit theo từng lead
      sau khi gửi. Kèm **R9b**: reminder bị đánh dấu tiêu thụ **cả khi mọi kênh
      fail** (`notify_new_lead` nuốt lỗi) → mất luôn lần nhắc duy nhất khi SMTP/Zalo
      chập; không có retry, không alert.
      **Đã sửa:** `notify_new_lead` giờ trả `bool` (có kênh nào gửi được không);
      `lead_reminders` chỉ set `reminder_sent_at` + `commit()` **ngay sau mỗi lead
      gửi thành công** (không dồn cuối vòng lặp), và **không đốt lượt nhắc** khi
      thất bại — lead đó tự động vào lượt chạy giờ sau. 3 test mới
      (`test_lead_reminders.py`) + 2 test cho `notify_new_lead` (`test_notify.py`).
- [x] **R10. Đổi mật khẩu không thu hồi phiên cũ.**
      `api/auth.py` (`reset_password`) đặt hash mới + cấp token mới nhưng không
      thu hồi refresh token đang lưu hành. Kẻ đã trộm refresh token giữ phiên tới
      hết 30 ngày kể cả sau khi chủ tài khoản reset mật khẩu → khôi phục tài khoản
      vô hiệu với kẻ đang xâm nhập.
      **Đã sửa:** cột mới `users.credentials_changed_at` (migration `0016`, NULL =
      chưa từng đổi, không backfill — backfill về bất kỳ mốc nào sẽ thu hồi luôn
      mọi phiên đang sống của mọi user). `reset_password` set mốc này ngay trước
      khi cấp token mới. `get_current_user`/`get_optional_user`/`/auth/refresh`
      so `payload["iat"]` với mốc này — token cấp trước bị coi là đã thu hồi,
      không cần tra Redis vì cả hai chỗ đã tải `User` từ DB sẵn cho mỗi request.
      **Đổi kèm:** `iat`/`exp` trong JWT giờ là epoch float thay vì datetime (PyJWT
      làm tròn datetime → int giây, mất phần dưới giây — token mới cấp ngay sau
      lúc đổi mật khẩu có thể rơi vào đúng giây đó và bị so sánh sai nếu chỉ có độ
      chính xác giây). **Không** áp dụng cho `set_email` (đặt email lần đầu cho tài
      khoản OAuth) — endpoint đó dùng chính phiên đang gọi để đổi, thu hồi phiên đó
      không cản được kẻ đang cầm nó, chỉ gây phiền cho người dùng thật. 1 test mới
      xác nhận cả access lẫn refresh token cũ đều 401 sau reset, token mới vẫn sống.
- [x] **R11. Không backup trước migration; migration tự chạy mỗi lần deploy.**
      `entrypoint.sh:10-17` chạy `alembic upgrade` mỗi lần container khởi động;
      `deploy.sh` không có bước dump. Một migration lỗi lúc 6PM có thể mất tới ~22h
      lead (backup mới nhất là 2AM), không rollback tự động. Sửa: gọi
      `backup-db.sh`/`pg_dump` ở đầu `deploy.sh`.
      **Đã sửa:** `deploy.sh` gọi `backup-db.sh` trước khi pull/build (bỏ qua nếu
      container `db` chưa chạy — lần deploy đầu — hoặc `SKIP_PRE_DEPLOY_BACKUP=1`);
      backup lỗi thì **dừng deploy**, không âm thầm áp migration mới mà thiếu điểm
      phục hồi mới hơn bản đang chạy.
- [x] **R12. Backup đêm fail mỗi tối trên đường VPS mặc định.**
      `backup-db.sh:54,100` đòi `gsutil` + bucket `gs://…`, nhưng `setup-server.sh`
      mặc định VPS/`build` mà vẫn cài cron backup GCS vô điều kiện → 2AM fail mỗi
      đêm, output chỉ vào file/syslog không ai theo dõi. `backup-to-local.sh` là
      bản thay nhưng phụ thuộc máy cá nhân bật + lịch thủ công. Sửa: chọn đường
      backup theo `STORAGE_BACKEND`/`DEPLOY_MODE`, hoặc backup DB xuống đĩa server
      rồi mới đẩy đi.
      **Đã sửa:** viết lại `backup-db.sh` — dump + verify xuống
      `${APP_DIR}/backups/postgres/` **luôn luôn** trước (giữ 14 ngày, tự xoá cũ
      hơn), coi đó là bản backup thật cho kịch bản `DEPLOY_MODE=build` (VPS).
      `DEPLOY_MODE=pull` (GCE) thì đẩy thêm bản đó lên GCS như cũ, và fail cứng nếu
      bước đẩy lỗi (kịch bản đó thật sự cần bản offsite) — nhưng dump local đã có
      nên không mất trắng như trước.
- [x] **R13. Redis prod không có volume → thu hồi token reset sau mỗi restart.**
      `docker-compose.prod.yml:30-38` không volume, không `--appendonly`; denylist
      `jti` (logout / token thu hồi) chỉ sống trong Redis. Restart Redis (deploy,
      OOM, reboot) → token đã "thu hồi" sống lại tới 30 ngày. Bộ đếm rate-limit
      cũng reset. Sửa: thêm volume + `appendonly` cho Redis prod.
      **Đã sửa:** thêm volume `redisdata:/data` + `command: redis-server
      --appendonly yes`.

### 🧹 LÀM DẦN — không chặn, dọn khi tiện

**R15, R17-R20, R22, R24 đã sửa (2026-08-20). R14 và R23 vẫn mở — xem lý do ở
từng mục. R21 hoá ra không phải lỗi — xem ghi chú.**

- [ ] **R14. `.env` chứa credential thật (Brevo SMTP key, Google OAuth secret).**
      `.env` đã trong `.gitignore` và `.dockerignore` (tốt), nhưng
      `backup-to-local.sh:121` chép `.env` sang máy khác. **Xoay (rotate) cả hai
      trước launch** cho chắc, và đừng để lọt vào backup dùng chung.
      *(Chưa làm — đây là hành động vận hành (đổi key thật ở Brevo/Google Console),
      không phải thay đổi code. Của bạn.)*
- [x] **R15. `GET /auth/me` không set `needs_email`** (`api/auth.py:269-281`) →
      social user (email giả `@oauth…`) nạp lại trang không bao giờ được hỏi email
      thật → không nhận thông báo lead. Điền `needs_email` như `/login` & `/exchange`.
      **Đã sửa** + 1 test mới.
- [x] **R16. Prod không có giới hạn RAM/CPU cho service nào**
      (`docker-compose.prod.yml`) — trên máy 2GB, `next build` (mode `build`) chạy
      cạnh Postgres → OOM killer hạ DB giữa deploy. Đặt `mem_limit` hoặc bắt buộc swap.
      **Đã sửa (một phần):** `mem_limit` cho cả 4 service prod (trần an toàn chống
      rò rỉ bộ nhớ, không phải kích cỡ đã tinh chỉnh). **Nhưng** `mem_limit` container
      **không** che được giai đoạn `docker compose build` (next build chạy ở đó,
      ngoài container) — nên `deploy.sh` giờ in cảnh báo nếu không thấy swap đang
      bật trước khi build ở `DEPLOY_MODE=build`. Bật swap thật vẫn là việc vận hành.
- [x] **R17. api.ts 401 → `window.location.href="/login"` vô điều kiện**
      (`lib/api.ts:106-116`) trong khi Navbar poll `/pts/me/stats` mỗi 60s
      (`Navbar.tsx:38-57`); PT hết hạn refresh đang đọc trang công khai / điền form
      bị đá về login, mất dữ liệu đang nhập. Chỉ redirect khi request do người dùng
      chủ động, hoặc bỏ qua với poll nền.
      **Đã sửa:** thêm `ApiOptions.redirectOnAuthFailure` (mặc định `true`); poll
      badge lead mới ở Navbar đặt `false` — vẫn `clearAuth()` khi phiên chết, chỉ
      không ép điều hướng.
- [x] **R18. `favorites/ids` không lọc `is_active`** (`api/favorites.py:44-57`) →
      tim đầy cho PT đã tắt hiển thị nhưng trang PT đó 404. Thêm filter như
      `list_favorites`. **Đã sửa** + 1 test mới.
- [x] **R19. Bộ lọc khu vực không dùng được index.**
      `api/pts.py:87-95`, `api/requests.py:146-157` lọc bằng
      `lower(ptmatch_unaccent(col)) ILIKE '%…%'` nhưng index là btree thường trên
      cột thô (comment 0011 nói phục vụ bộ lọc mà nó không phục vụ được). Vô hại ở
      quy mô kiểm chứng (seq scan bảng nhỏ), cần gin/expression index trước traffic
      thật.
      **Đã sửa:** migration `0017` — `CREATE EXTENSION pg_trgm` + 4 index GIN
      trigram đúng biểu thức (`lower(ptmatch_unaccent(city|ward))`) cho cả
      `pt_locations` và `trainee_requests`. Xác nhận bằng `EXPLAIN` (buộc
      `enable_seqscan=off`): planner chọn đúng index mới, không lệch biểu thức.
      Giữ nguyên 2 index btree cũ (admin.py còn `GROUP BY` trên cột thô).
- [ ] **R20. Vài chỗ crash/flash nhỏ frontend:** `track/[token]` không có fallback
      cho status lạ (`page.tsx:114,131`); `reset-password` nháy "liên kết không hợp
      lệ" một frame trên mỗi lượt hợp lệ (đọc token trong `useEffect`);
      `login?oauth_error=…%` có thể `URIError` do double-decode; OAuth login rớt
      `?next=`. Từng cái nhỏ, gom sửa khi tiện.
      **Đã sửa cả 4:** `STATUS_INFO[lead.status] ?? {...fallback}`;
      `reset-password` phân biệt `token === null` (chưa kiểm) với `token === ""`
      (đã kiểm, rỗng) — không còn render "invalid" một frame trước khi biết; bỏ
      `decodeURIComponent()` thừa ở `login` (searchParams đã tự decode); `?next=`
      giờ xuyên suốt qua OAuth (`*_login` endpoint → Redis state → redirect
      `/auth/callback?next=` → `safeNextPath()` trước khi dùng).
- [x] **R21. `requirements.lock` không freeze đủ** — thiếu transitive của
      `google-auth` (`rsa`, `cachetools`) nên chúng cài không ghim mỗi lần build,
      phá cam kết "CI image == prod image".
      **Đã kiểm, KHÔNG phải lỗi:** `pip freeze` thật trong container khớp 100% với
      `requirements.lock` (diff = 0 dòng khác comment). `google-auth==2.56.3` hiện
      tại không còn khai `cachetools`/`rsa` là dependency bắt buộc (chỉ
      `cryptography` + `pyasn1-modules`; `rsa` chỉ ở extra `[rsa]` không cài) — phát
      hiện gốc dựa trên hành vi phiên bản cũ hơn, không đúng với version đang pin.
- [x] **R22. `mailer.py:56-58` chỉ hỗ trợ STARTTLS** — ops cấu hình cổng 465
      (implicit TLS, phổ biến ở VN) sẽ treo 10s rồi lỗi khó hiểu mỗi thư.
      **Đã sửa:** thêm `SMTP_USE_SSL` (mặc định `false`, không đổi hành vi hiện tại
      với Brevo/587/STARTTLS); bật thì dùng `smtplib.SMTP_SSL` và bỏ qua
      `starttls()`. 2 test mới xác nhận đúng lớp SMTP được chọn theo cờ.
- [ ] **R23. Zalo OA access token tĩnh, không refresh** (`channels/zalo.py:22-24`)
      — token OA ngắn hạn, hết hạn thì kênh chính im lặng fail mãi (rơi xuống email,
      mà email có thể chưa cấu hình theo R5). *(Liên quan mục Nhóm D `zalo_user_id`
      chưa có đường ghi — cả hai khiến kênh Zalo chưa dùng thật được.)*
      *(Chưa làm — có chủ đích. Refresh thật cần: nơi lưu access+refresh token sống
      qua restart (Settings hiện tĩnh từ .env), một luồng lấy refresh_token ban đầu
      (đồng ý OA riêng với luồng Zalo Login đang có), và job làm mới trước khi hết
      hạn. Không có credential Zalo OA thật để thử, viết mù một luồng OAuth bên thứ
      ba là rủi ro cao hơn lợi ích — kênh này đã có email làm dự phòng.)*
- [x] **R24. Dev compose bind Postgres/Redis ra `0.0.0.0`**
      (`docker-compose.yml:10-11,20-21`) — nếu lỡ chạy stack dev trên máy có IP
      công khai thì Postgres (mật khẩu dev) + Redis không auth lộ thẳng (Docker
      bypass ufw). Đổi sang `127.0.0.1:5432:5432`. Chỉ ảnh hưởng dev.
      **Đã sửa, và sửa lại lần hai (2026-08-20) sau khi chạy thật:**
      - **Redis: bỏ hẳn publish ra host.** Không có gì cần chạm tới nó từ host —
        backend gọi `redis://redis:6379` trong network compose, test chạy bằng
        `docker compose exec backend pytest` nên cũng ở trong đó. Soi Redis thì
        `docker compose exec redis redis-cli`. Bỏ publish tốt hơn bind loopback:
        không mở cửa nào cả.
      - **Postgres: `"${DB_BIND_HOST:-127.0.0.1}:${DB_HOST_PORT:-5432}:5432"`.**
        Mặc định vẫn loopback. Hai biến này là van thoát cho WSL2: service
        port-forward của Windows (`svchost`/winnat) giữ lại reservation cổng
        5432 của container cũ, và khi đó **mọi** cách bind cổng đó đều bị từ
        chối (cả `127.0.0.1` lẫn `0.0.0.0`). Máy dev hiện tại đang đặt
        `DB_HOST_PORT=15432` trong `.env` — kết nối GUI/psql từ host qua
        `localhost:15432`. Về lại 5432 sau khi
        `net stop winnat && net start winnat` (cần admin) hoặc reboot.

**Đã kiểm và KHÔNG phải lỗi (khỏi cờ nhầm khi đọc lại):** phân quyền đọc role từ
DB chứ không tin claim JWT; OAuth merge chỉ khi `email_verified` (chặn chiếm tài
khoản qua email chưa xác minh); admin tách khỏi cả OAuth lẫn cửa login thường;
path traversal chặn hai lớp ở storage; giới hạn upload 10MB stream không tin
`Content-Length`; nginx `client_max_body_size 15m` khớp; JSON-LD escape trước
`dangerouslySetInnerHTML`; `safeNextPath` chặn open-redirect `//`/`\`; token
lead-tracking ngẫu nhiên mật mã (không IDOR); migration 0001→0015 tuyến tính,
backfill no-op trên DB rỗng; cascade xoá coherent; container chạy non-root;
backup có verify (`gzip -t`, size floor, content check); seed chặn `production`.

---

## ✅ Đã xong

### B1. CTA ghim đáy màn hình mobile trên trang hồ sơ PT
- `components/MobileLeadCTA.tsx` (mới): thanh `fixed bottom-0 lg:hidden`, hiện
  tên PT + giá/buổi + nút "Nhận tư vấn" cuộn tới form. Tự ẩn (trượt xuống) khi
  form đã vào khung nhìn qua `IntersectionObserver`, nên không che nút gửi.
- `app/(public)/pt/[slug]/page.tsx`: khối form nhận `id="lead-form"` +
  `scroll-mt-20`, mount `MobileLeadCTA`.
- `app/globals.css`: `.input` đổi sang `text-base sm:text-sm` — 16px trên mobile
  để Safari iOS không tự phóng to trang khi focus; `.btn` `py-3 sm:py-2.5` cho
  vùng chạm ≈46px.
- Sự kiện mới `lead_cta_mobile_click` trong `lib/analytics.ts` để đo thanh này
  có được dùng không.

### B2. Cứu chuyển đổi khi tìm 0 kết quả + lộ đường vào chợ ngược
- `components/EmptySearchCTA.tsx` (mới): empty state của `/pts` giờ có CTA
  chính "Đăng yêu cầu — để PT liên hệ bạn", **mang theo chuyên môn + khu vực
  đang lọc** sang `/requests/new`. Nhánh lỗi backend vẫn giữ "Xoá bộ lọc".
- `app/(public)/requests/new/page.tsx`: đọc `?specialty=&city=&ward=` để điền
  sẵn — người dùng vừa khai xong, bắt khai lại là lý do bỏ ngang.
- Navbar (cả drawer mobile) + Footer: thêm link "Đăng yêu cầu tìm PT".
- `/requests`: empty state có nút "Xoá bộ lọc" khi đang lọc.
- Sự kiện mới `empty_search_to_request`.

### B3. Chặn hồ sơ rỗng khỏi chỗ công khai
- `backend/app/services/listing.py` (mới): một chỗ duy nhất định nghĩa "đủ điều
  kiện hiển thị" = còn hoạt động **và** có avatar **và** có giá theo buổi > 0
  **và** có ≥1 khu vực. Hai biểu diễn cạnh nhau: `listable_clause()` cho SQL,
  `missing_listing_requirements()` cho Python.
- Áp dụng cho `GET /api/pts` và `GET /api/pts/sitemap`. **Không** áp cho
  `GET /api/pts/{slug}` — link đã chia sẻ thì không được gãy, và PT phải xem
  trước được trang của mình.
- `GET|PUT /api/pts/me` trả thêm `missing_listing`.
- `components/ListingChecklist.tsx` (mới), hiện ở `/dashboard` (trên các thẻ số
  liệu) và `/dashboard/profile`: "Hồ sơ chưa hiển thị công khai — còn thiếu:
  [Ảnh đại diện] [Giá theo buổi] [Khu vực hoạt động]".
- Đăng ký xong PT vào thẳng `/dashboard/profile` thay vì bảng số 0.
- Bảng giá trên hồ sơ công khai chỉ dựng thẻ **có giá** — hết hàng bốn ô "—".
- Thêm toggle "Cho phép học viên tìm thấy tôi" (`is_active`) trong hồ sơ.
- `/register` đọc `?role=` (trước đây bỏ qua, chạy đúng chỉ vì trùng mặc định).

### B4. Vá copy & tin cậy
- Gỡ lời hứa "PT sẽ liên hệ trong vòng 24 giờ" khỏi trang chủ — đã cố ý gỡ khỏi
  LeadForm từ trước vì không có số liệu chống lưng.
- LeadForm: thêm dòng ngay dưới ô SĐT — "Chỉ {tên PT} nhận được số này. Không
  hiển thị công khai trên hồ sơ."
- LeadForm success: thêm lối ra "Đăng yêu cầu tìm PT" / "Xem PT khác" để phễu
  không chết ở một PT.
- `HomeCTA` dựng nhánh khách ngay từ server (trước trả `null` tới khi hydrate →
  CTA cuối trang vắng khỏi HTML nguồn và nhảy layout).
- Bỏ "nhận học viên mới **mỗi ngày**" khỏi CTA dành cho PT.

### C1. Trang pháp lý
- `/privacy` và `/terms` (mới), viết theo đúng những gì hệ
  thống làm thật — ai nhìn thấy SĐT, sự kiện nào gửi về Facebook, giữ dữ liệu
  bao lâu, PTMatch không phải bên cung cấp dịch vụ huấn luyện.
- Footer có link 2 trang + địa chỉ email; cả hai vào `sitemap.ts`.
- `lib/contact.ts` (mới) gom địa chỉ liên hệ về một chỗ.

### C2. Ảnh chia sẻ mặc định
- `app/opengraph-image.tsx` (mới) sinh PNG 1200×630 bằng `next/og` — không phải
  nhét ảnh nhị phân vào repo. Phủ cho mọi route không tự khai ảnh riêng. Đã
  render thử: chữ tiếng Việt có dấu hiển thị đúng.

### C3. Đánh giá: hiển thị ngay, xử lý sau
- Migration `0015`: thêm `reviews.approved_at` + index một phần.
- Ban đầu làm dạng hàng chờ duyệt, sau đó **bỏ theo quyết định 2026-08-19**:
  hàng chờ không ai trực = đánh giá thật không bao giờ hiện, tệ hơn thi thoảng
  lọt một cái giả. Giờ đánh giá lên hồ sơ ngay khi gửi.
- `approved_at` giữ lại với nghĩa "đang hiển thị": `PATCH /api/admin/reviews/{id}`
  gỡ xuống / bật lại. Xoá vĩnh viễn vẫn ở `DELETE /api/reviews/{id}`.
- Sửa nội dung **không** ẩn đánh giá đi — nếu không, người sửa lỗi chính tả mất
  luôn đánh giá của mình.
- `app/services/rating.py` (mới): `avg_rating`/`review_count` chỉ đếm đánh giá
  đang hiển thị, một chỗ duy nhất tính.
- Chống giả mạo vẫn dựa vào cái sẵn có: mỗi đánh giá ẩn danh tốn một SĐT khác
  nhau, PT không tự đánh giá mình, rate limit 5/phút·20/giờ.

### A2 (phần code)
- `POST /api/requests/{id}/claim` giờ **có bắn thông báo** cho PT (trước đây im
  lặng hoàn toàn): gửi thông tin liên hệ để họ gọi từ điện thoại, và tạo bản ghi
  trong `notification_deliveries` để phễu chợ ngược cũng đo được kênh.
  Nội dung riêng (`is_claim`), không dùng lại câu "bạn có lead mới".

### A3 (phần chặn launch tự phục vụ) — vai trò OAuth, avatar, quên mật khẩu
- **Bỏ bộ chọn vai trò ở `/login`.** Đây là nguồn của cái bẫy: PT bấm "Đăng nhập
  với Facebook" ở đó thành học viên vĩnh viễn, không hồ sơ, chỉ sửa được bằng SQL.
- **`POST /api/auth/oauth/exchange` trả thêm `is_new`** → frontend đưa tài khoản
  vừa tạo tới `/welcome` để hỏi vai trò. (Trường này từng bị `response_model`
  cũ lọc mất trong im lặng — đã có test hồi quy riêng.)
- **`POST /api/auth/become-pt`** — van an toàn, chuyển học viên sang PT và tạo hồ
  sơ, idempotent, cấp lại token vì token cũ mang `role: trainee`.
- **Chép `users.oauth_avatar_url` sang `pt_profiles.avatar_url`** lúc tạo hồ sơ
  (`_create_pt_profile`) — thoả sẵn một trong ba điều kiện publish ngay tại giây
  đăng ký.
- **`/welcome`** (mới): đúng hai bước — xác nhận vai trò, rồi giá + khu vực.
  Không dựng wizard nhiều bước, vì sau khi có avatar từ OAuth thì chỉ còn hai ô.
- **Quên mật khẩu** (mới): `POST /api/auth/forgot-password` →
  `POST /api/auth/reset-password`, token một lần trong Redis hạn 30 phút, huỷ
  ngay lúc đọc. Luôn trả 202 để không lộ email nào đã đăng ký. Tài khoản chỉ có
  OAuth nhận thư chỉ đường về nút đăng nhập tương ứng. Trang `/forgot-password` và
  `/reset-password`; link "Quên mật khẩu?" trong form đăng nhập.
- **`app/services/mailer.py`** (mới): tách SMTP ra dùng chung cho thư giao dịch
  và kênh thông báo lead. `MailResult.error` giữ nguyên thông điệp lỗi SMTP để
  `GET /admin/lead-ops` còn chẩn đoán được.
- `/welcome`, `/forgot-password`, `/reset-password` vào `robots.ts` disallow
  (token đặt lại mật khẩu nằm trong URL).

### Thu hút PT (2026-08-19)
- **`/for-trainers`** (mới) — trang đích để dán vào bài post trong group Facebook.
  Trước đây PT bấm link từ group sẽ rơi vào trang chủ vốn viết cho học viên.
  6 lợi ích, 3 bước đăng ký, 6 câu hỏi thường gặp (miễn phí thật không / có ăn
  hoa hồng không / mất bao lâu / học viên có thấy SĐT tôi không / kín lịch thì
  sao / có phải môi giới không), CTA → `/register?role=pt`.
  **Nguyên tắc viết đã ghi trong file:** không hứa có sẵn học viên. Thứ bán được
  ngay hôm nay mà không cần chợ đông là *trang cá nhân* (link sạch, chuẩn SEO,
  có bảng giá và đánh giá). Chợ ngược nói như thứ đang lớn dần, không làm tiêu đề.
- **`components/ShareProfile.tsx`** (mới) — khối chia sẻ trong `/dashboard`:
  chép link, đăng thẳng lên Facebook, chép sẵn đoạn bài đăng, và Web Share API
  trên mobile (ra được Zalo/Messenger). Origin lấy từ `window` chứ không phải
  biến build, để link không trỏ nhầm domain.
- Dashboard hiện **một trong hai** ở slot trên cùng: hồ sơ chưa đủ → checklist
  còn thiếu gì; hồ sơ đã hiển thị → mời chia sẻ. Hai trạng thái nối tiếp nhau.
- Sự kiện mới `share_profile` (kèm `method`) để biết PT có thật sự chia sẻ không.
- `/for-trainers` vào footer (cột "Dành cho PT") và `sitemap.ts`.
- Gỡ nốt "nhận học viên mới **mỗi ngày**" khỏi description dùng chung toàn site
  (`app/layout.tsx`) — cùng lời hứa đã gỡ khỏi HomeCTA, còn sót ở đây nên nó
  theo mọi link chia sẻ đi khắp nơi.

### SEO + GEO tầng thương hiệu (2026-08-20)
GEO = **Generative Engine Optimization** (được engine sinh nội dung trích dẫn),
không phải geo/local SEO. Làm **tầng thương hiệu**, cố ý KHÔNG làm tầng nội dung
chợ: với 0-20 PT thì truy vấn kiểu "tìm PT giảm cân ở Thủ Đức" không có gì để
trích dẫn. Cùng logic với việc không sinh trang landing theo phường.

**Vì sao đáng làm ngay:** khi PT nghe tên PTMatch trong group Facebook, nhiều
người đi hỏi engine sinh nội dung trước khi đăng ký ("có thu phí không?", "có ăn
hoa hồng không?"). Không có mô tả canonical → engine trả lời "không tìm thấy
thông tin", với người đang cân nhắc thì đọc ra là *"app lạ, đáng ngờ"*; tệ hơn là
nó đoán bừa một mức hoa hồng, tức phủ định đúng lời hứa bán hàng chính. **Đây là
phòng thủ thương hiệu, không phải kênh thu hút** — và nội dung đã có sẵn.

- **`FAQPage` JSON-LD ở `/for-trainers`** — 6 cặp Q/A lấy từ **cùng** catalog với
  phần hiển thị (không viết lại; hai bản lệch nhau là markup nói khác trang).
  *Đừng kỳ vọng rich result FAQ của Google* — từ 2023 gần như chỉ còn cho site cơ
  quan nhà nước/y tế. Giá trị ở đây là cặp Q/A có cấu trúc cho engine trích dẫn.
- **`Organization` JSON-LD ở layout gốc** (trước đây không có). `areaServed` lấy
  từ cùng nguồn với ô chọn khu vực (`SERVED_PROVINCES`) — tuyên bố có thật, không
  phải "toàn quốc".
- **Đoạn "PTMatch là gì?"** trên `/for-trainers`, ngay sau hero. Văn xuôi thuần,
  mỗi câu là một khẳng định kiểm chứng được (miễn phí, không hoa hồng, không cần
  tài khoản, SĐT không công khai, **không** xác minh chứng chỉ). Viết để trích
  nguyên văn: engine dẫn y nguyên nên câu mơ hồ vừa không được dùng vừa dễ bị
  diễn giải thành điều ta không hứa.
- **SSR trang đánh giá đầu** (`getReviews` ở `pt/[slug]/page.tsx`, 5 mục) và
  truyền xuống `ReviewSection` làm state khởi tạo. Trước đây đánh giá — nội dung
  giàu nhất của trang — do client fetch sau hydrate: Googlebot có chạy JS (dù
  trễ) nhưng crawler của engine sinh nội dung phần lớn không, nên với chúng đánh
  giá coi như không tồn tại. Phần tương tác (gửi, xem thêm, lightbox) vẫn client.
- **JSON-LD hồ sơ: `Person` → `LocalBusiness`** + `priceRange`, `makesOffer`
  (`Offer` giá/buổi, VND), và `review[]`. Google chỉ hiện sao cho một tập type
  nhất định mà **`Person` không thuộc** — `aggregateRating` gắn vào `Person` là
  markup đúng cú pháp nhưng không bao giờ ra kết quả. *Đánh đổi đã biết:* PT là
  người chứ không phải doanh nghiệp, và chỉ có phường/xã nên `address` là địa chỉ
  một phần. `review[]` **chỉ** chứa đánh giá thật sự render trên trang — nhiều
  hơn nội dung nhìn thấy là vi phạm chính sách structured data. Đây là lý do mục
  này và mục SSR ở trên phải đi cùng nhau.

**Kiểm chứng trên stack thật** (không phải chỉ build xanh): `/for-trainers` có 2
script `ld+json` (Organization + FAQPage đủ 6 câu); `/pt/<slug>` ra
`@type=LocalBusiness`, `priceRange=500.000₫`, `makesOffer=500000 VND`,
`aggregateRating=4.75/4`, `review[]=4`; và **nội dung 3 đánh giá nằm sẵn trong
phần HTML hiển thị sau khi gỡ hết thẻ `<script>`** — tức không cần JS để đọc.

**Việc của bạn, cần domain:** Google Search Console **và Bing Webmaster Tools**
(ChatGPT Search dựa nhiều vào index của Bing — đa số chỉ làm GSC rồi bỏ Bing).
`robots.ts` hiện không chặn bot AI nào nên không phải làm gì; nhưng nếu sau này
đặt site sau Cloudflare thì nhớ nhiều cấu hình mặc định của họ **chặn** AI bot.

> **Đòn bẩy lớn nhất không nằm trong code:** engine sinh nội dung tổng hợp từ
> nguồn bên thứ ba (thảo luận, bài viết, listicle). Group Facebook phần lớn
> không crawl được nên post ở đó gần như không giúp GEO. Đó là việc marketing về
> sau — ghi ra để không nghĩ rằng cắm đủ JSON-LD là xong.
>
> **`llms.txt`**: có tồn tại như quy ước đang nổi, chi phí gần bằng 0, nhưng chưa
> có bằng chứng công khai engine lớn nào đọc nó. Chưa làm.

### Giới hạn vùng phục vụ: TP.HCM + Đồng Nai (2026-08-20)
Chợ hai chiều sống bằng **mật độ**, không bằng độ phủ: 20 PT rải khắp 34 tỉnh là
chợ chết ở mọi nơi, 20 PT trong TP.HCM là chợ sống được ở vài phường. Đây cũng là
cách giảm CPL — ads nhắm 2 tỉnh thay vì toàn quốc.

**Chỉ cần 2 mục là phủ trọn vùng Đông Nam Bộ** vì sau sáp nhập 01/07/2025:
- TP.HCM (168 phường/xã) = TP.HCM cũ + **Bình Dương** + **Bà Rịa – Vũng Tàu**
- Đồng Nai (95 phường/xã) = Đồng Nai cũ + **Bình Phước**

Tổng **263 phường/xã**. Bình Dương không còn là tỉnh nên không liệt kê riêng —
PT ở Dĩ An/Thủ Dầu Một chọn TP.HCM rồi tìm phường của mình.

- `SERVED_PROVINCES` trong `.env` (backend) + `SERVED_PROVINCES` trong
  `frontend/lib/constants.ts`. **Để rỗng = bỏ giới hạn, chạy toàn quốc.** Hai
  bản sao vì `NEXT_PUBLIC_*` nhúng lúc build — đổi vùng phải sửa cả hai rồi
  build lại image frontend.
- `app/services/coverage.py` (mới): backend **từ chối ghi** (422) khu vực ngoài
  vùng, ở cả `POST /api/pts/me/locations` và `POST /api/requests` (validator ở
  schema nên mọi đường ghi đều dính). Frontend lọc ô chọn chỉ là UI — API vẫn
  nhận giá trị bất kỳ nếu gọi trực tiếp.
- **Chuẩn hoá tên tỉnh, không chỉ chặn.** Nhận khoan dung (`HCM`, `TP.HCM`,
  `Sài Gòn`, thiếu dấu, thiếu tiền tố) nhưng **lưu đúng dạng danh mục**. Nếu chỉ
  chặn thì `"HCM"` lưu trong DB không bao giờ gặp `"Thành phố Hồ Chí Minh"` mà
  học viên chọn từ ô chọn (bộ lọc so khớp chuỗi con) — đúng lỗi alembic `0012`
  đã phải dọn một lần.
- **Trang sửa hồ sơ PT: đổi input tự do tỉnh/phường sang `LocationSelect`.**
  Đây là chỗ duy nhất còn gõ tay, và là nguồn sinh ra đúng cái bất nhất trên.
- Dòng chú thích ở 3 form ghi (`/welcome`, `/requests/new`, `/dashboard/profile`)
  nói rõ đang mở ở đâu **và** nhắc hai tỉnh này đã gồm Bình Dương/Vũng Tàu/Bình
  Phước — không có câu đó thì PT ở Dĩ An tìm "Bình Dương" không thấy rồi bỏ đi.
- Seed đổi 4 mục Hà Nội sang Đồng Nai cho khớp vùng phục vụ.
- 21 test mới (`tests/test_coverage.py`). **205 test pass**, `next build` xanh.

> **Việc còn lại của vận hành:** TP.HCM sau sáp nhập rất rộng (Củ Chi → Côn Đảo),
> nên "cùng thành phố" không còn nghĩa là "gần nhau". Bộ lọc **phường/xã** giờ
> quan trọng hơn bộ lọc tỉnh — đáng xem lại thứ tự ưu tiên hiển thị/sort sau này.

### Đa ngôn ngữ (2026-08-20)
- **next-intl** với thiết kế "một ngôn ngữ hôm nay, mở rộng sau không sửa code":
  `i18n/config.ts` (LOCALES + `resolveLocale()`), `i18n/request.ts`, `messages/vi.json`.
- **Không thêm tiền tố `/vi` vào URL** — site một ngôn ngữ không đáng chịu thêm
  một chặng chuyển hướng, và URL vừa đổi xong không nên đổi lần nữa. Khi có ngôn
  ngữ thứ hai thì bật `localePrefix: "as-needed"`, link cũ không gãy.
- **60/74 file đã chuyển**, 57 namespace. Còn lại là admin (cố ý bỏ) và vài
  trường hợp có chủ đích (giá trị gửi backend, tên thương hiệu, code bóc dấu).
- **Catalog phân vùng theo khu vực**: `SERVER_ONLY` (văn bản dài, metadata) không
  bao giờ gửi; `AUTH_ONLY` chỉ gửi ở layout /dashboard và /account. Hai layout đó
  đổi thành server component, vỏ client tách ra `DashboardShell`/`AccountShell`.
- Dùng danh sách **loại trừ** chứ không phải cho phép: quên một dòng ở danh sách
  cho phép làm trang trắng sau hydrate (đã dính đúng lỗi này một lần trong lúc làm).

### OAuth + danh tính email (2026-08-20)
- **Cả ba provider đã đấu nối xong trong code**: Google (`openid email profile`),
  Facebook (`email,public_profile`), Zalo v4 **kèm PKCE S256** (Zalo bắt buộc).
  Mã đổi token là mã dùng-một-lần lưu Redis, không nhét token vào URL.
- **`app/services/identity.py`** (mới) — xử lý việc Zalo không trả email và
  Facebook thì người dùng từ chối chia sẻ được. Tài khoản như vậy được cấp email
  giả `<provider>_<id>@oauth.ptmatch.vn`. Ba hệ quả, mỗi cái một chỗ:
  - `oauth.py` sinh ra nó;
  - `api/auth.py` **không bao giờ gộp tài khoản** qua email giả (gộp theo email
    chưa xác minh là lỗ chiếm tài khoản kinh điển — chỉ gộp khi `email_verified`);
  - `channels/email.py` trả `skipped` chứ không phải `sent`, để `/admin/lead-ops`
    không báo "đã gửi" cho một địa chỉ không tồn tại.
- **`POST /api/auth/set-email`** + cờ `needs_email` — `/welcome` hỏi email thật
  cho tài khoản SNS không có. Cờ do backend tính, frontend **không** tự đoán
  theo tên miền (`frontend/lib/types.ts:9-15`).
- **Google đã cấu hình thật và đăng nhập được.** Facebook và Zalo còn trống —
  vướng bên thứ ba, xem mục ⏳ bên dưới.

### Đường dẫn chuyển hết sang tiếng Anh (2026-08-20)
`/chao-mung`→`/welcome`, `/quen-mat-khau`→`/forgot-password`,
`/dat-lai-mat-khau`→`/reset-password`, `/danh-cho-pt`→`/for-trainers`,
`/chinh-sach-bao-mat`→`/privacy`, `/dieu-khoan`→`/terms`,
`/theo-doi/[token]`→`/track/[token]`.
Làm **trước khi có traffic** là đúng thời điểm: chưa có link ngoài nào để gãy,
và không phải dựng bảng redirect. Sau khi post lên group thì đổi URL là mất link.

### Hạ tầng email dev
- Thêm service **Mailpit** vào `docker-compose.yml` (UI `:8025`, SMTP `:1025`) —
  hộp thư giả, không gửi ra ngoài, không tốn quota nhà cung cấp. Đây là cách
  kiểm chứng đường ống thông báo ở local mà không cần domain.

### Test
- 14 test mới; 6 test cũ cập nhật theo hành vi mới (chúng đang khẳng định hành
  vi cũ); 3 test notify đổi đích patch sau khi tách `mailer.py`. **162 passed** (tính cả các test OAuth/identity thêm sau).
- Helper mới trong `tests/test_api.py`: `make_listable()`, `approve_review()`.

---

## ⏳ Còn lại — cần đầu vào từ bạn

### A1. Điền ID đo lường ⏱ 30 phút — **CHẶN GIAI ĐOẠN 1**
Kiến trúc đúng như đã chốt (GA4 trực tiếp, `lib/analytics.ts:29` tự tắt GA4 khi
có GTM_ID), chỉ là chưa có ID nên `gtag.js` không bao giờ được nạp và mọi
`track()` là no-op.

- [ ] Tạo GA4 property → `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX` vào
      `frontend/.env.production`. Giữ `NEXT_PUBLIC_GTM_ID` **rỗng**.
- [ ] Trước khi chạy ads: `NEXT_PUBLIC_FB_PIXEL_ID` (cần cho sự kiện chuẩn
      `Lead`, `lib/analytics.ts:72`).
- [ ] **Build lại image frontend** — biến nhúng lúc build, restart không đủ.

**Nghiệm thu:** DevTools → Network thấy `gtag/js?id=G-...`; GA4 DebugView nhận
`search_pts`, `view_pt_profile`, `lead_form_start`, `lead_submit_success`, và
hai sự kiện mới `lead_cta_mobile_click`, `empty_search_to_request`.

### ⛔ TÊN MIỀN — nút thắt số 1, chặn mọi thứ còn lại
`ptmatch.vn` **chưa đăng ký / chưa trỏ DNS** (kiểm lại 2026-08-20: không phân
giải được). Đây không phải chuyện thẩm mỹ — nó là nguyên nhân gốc làm email
chết:

> Brevo từ chối gửi với lỗi *"the sender you used no-reply@ptmatch.vn is not
> valid"*. Không nhà cung cấp nào cho gửi từ một domain bạn chưa chứng minh
> được là của mình, mà muốn chứng minh thì domain phải tồn tại trước.

Mua domain xong, làm **một lượt** những việc sau (chúng cùng phụ thuộc một thứ,
tách ra làm nhiều đợt chỉ tốn công deploy):

- [ ] Đăng ký domain. Nếu **không** phải `ptmatch.vn` thì phải sửa thêm: hai
      trang pháp lý, `frontend/lib/contact.ts`, `nginx server_name`, mẫu bucket
      / CDN trong `.env` (`cdn-<env>.ptmatch.vn`), và tên miền email giả
      `@oauth.ptmatch.vn` trong `backend/app/services/identity.py`
      (**đổi hằng số này thì tài khoản SNS cũ mất cờ `needs_email`** — hoặc giữ
      nguyên hằng số cũ, hoặc nhận cả hai tên miền).
- [ ] Brevo → *Senders, domains, IPs* → xác minh domain. **Bước này chính là cài
      SPF + DKIM**; thiếu nó thì thư có gửi được cũng rơi vào Spam và PT không
      bao giờ biết có lead.
- [ ] `.env`: `SMTP_FROM` theo domain thật, `SITE_URL`, `FRONTEND_BASE_URL`,
      `CORS_ORIGINS`, `ENVIRONMENT=production`.
- [ ] Thêm redirect URI production cho Google / Facebook / Zalo.
- [ ] `docker compose up -d backend` — **KHÔNG phải `restart`**: `.env` chỉ được
      nạp lúc *tạo* container, `restart` dùng lại biến môi trường cũ. (Đã mất
      thời gian vì đúng cái này một lần rồi.)
- [ ] Tạo hộp thư `lienhe@<domain>` thật.

**Nghiệm thu:** Brevo → *Transactional* → *Logs* trạng thái `delivered` (không
phải `sent`), và `GET /admin/lead-ops` thấy `email: sent` chứ không chỉ `log`.

### A2 (phần cấu hình). Kênh email — đã dựng xong, đang chờ domain
Đường ống đã chạy thật **end-to-end qua Mailpit** ở dev, nên phần code coi như
xong. `.env` hiện đã trỏ Brevo và điền key mới; nó sẽ gửi được ngay khi domain
được xác minh, không cần sửa code.

- [x] Chọn nhà cung cấp: **Brevo** (300 thư/ngày free, đủ xa cho giai đoạn kiểm
      chứng — **đừng dùng Gmail cá nhân**: ~500 thư/ngày và dễ vào spam).
- [x] `NOTIFY_CHANNELS=email,log`, `SMTP_*` đã điền, `SMTP_USE_TLS=true`
      (cổng 587 của Brevo bắt buộc STARTTLS — `mailer.py:57`; để `false` là
      Brevo từ chối xác thực, triệu chứng trông y hệt sai key).
- [ ] Chờ domain → xem mục ⛔ bên trên.
- [ ] Khi có Zalo OA: đổi thành `NOTIFY_CHANNELS=zalo_oa,email,log` — chain tự
      rơi xuống email cho PT chưa follow OA, không phải sửa code. **Nhưng xem
      cảnh báo `zalo_user_id` ở nhóm D trước**, hiện kênh này luôn `skipped`.

> Cron nhắc lead **đã có sẵn** trong `scripts/setup-server.sh:183` (mỗi giờ,
> khung 7h–21h) — báo cáo review ban đầu nói thiếu là sai, đã kiểm chứng lại.

> **Muốn thử thông báo ở local trong lúc chờ domain:** đổi `SMTP_HOST=mailpit`,
> `SMTP_PORT=1025`, `SMTP_USE_TLS=false`, xoá `SMTP_USER`/`SMTP_PASSWORD`, rồi
> `docker compose up -d backend`; xem thư ở http://localhost:8025. Không tốn
> quota Brevo và không cần domain.

### A3 (phần còn lại). Công cụ admin tạo hồ sơ hộ PT — **đã hạ ưu tiên**
Không seed thủ công nữa thì phần này gần như không cần. Chỉ làm nếu về sau muốn
onboard theo lô (VD ký với một chuỗi phòng gym). Nửa quan trọng của A3 —
quên mật khẩu và vá vai trò OAuth — **đã xong**, xem mục ✅ bên trên.

### Cấu hình OAuth — chờ bên thứ ba, **CHẶN LAUNCH**
Code đã đấu nối đủ cả ba provider (xem mục ✅). Còn lại là thủ tục bên ngoài.

- [x] **Google** — đã điền khoá, đăng nhập được ở dev.
- [ ] Google: nếu gặp `Lỗi 400: redirect_uri_mismatch` thì **sửa ở Google
      Console**, không phải ở code. Phía backend đã kiểm chứng là đúng: chuỗi
      trong Console phải khớp **từng ký tự** với `GOOGLE_REDIRECT_URI` trong
      `.env` (kể cả `http` vs `https` và dấu `/` cuối). Nhớ thêm cả URI
      production khi có domain.
- [ ] **Facebook — bắt đầu sớm, đây là hạng mục chờ lâu nhất.** Quyền `email`
      cho chế độ công khai cần App Review; quy trình vài ngày đến vài tuần và
      không rút ngắn được. Đừng để sát ngày post lên group.
- [ ] **Zalo** — bị chặn ở bước trước cả app: tài khoản Zalo cá nhân phải
      **xác thực CCCD** mới tạo được app trên developers.zalo.me. Việc của bạn,
      không phải việc code.
- [ ] Kiểm tra luồng thật một lượt cho mỗi provider: đăng ký mới → `/welcome`
      → (nếu là Zalo/Facebook không có email: hỏi email) → chọn PT → điền giá +
      khu vực → hồ sơ lên `/pts`.

### Cold start — rủi ro lớn nhất của hướng tự phục vụ
Không seed cung trước nghĩa là tuần đầu hai bên đều thấy chợ trống: PT vào thấy
0 yêu cầu rồi đi, học viên tìm thấy 0 PT rồi đi. Không có việc code nào sửa
được chuyện này, nhưng có ba thứ đã sẵn sàng đỡ:

- Tìm 0 kết quả → CTA đăng yêu cầu (đã làm, B2) là van hứng nhu cầu khi chưa có cung.
- Block "Học viên đang tìm PT" trên trang chủ tự ẩn khi dưới 3 yêu cầu, thay
  bằng thẻ mời đăng — trang không bao giờ trông như chợ chết.
- Cổng chặn hồ sơ rỗng (B3) giữ những tài khoản đăng ký rồi bỏ dở khỏi `/pts`.

Việc còn lại là của vận hành, không phải của code: **post cho cả hai phía trong
cùng một khoảng thời gian**, đừng để một bên đến trước cả tuần.

### C. Trước khi nộp ads
- [ ] **Tạo hộp thư `lienhe@ptmatch.vn` thật** (hoặc đổi
      `NEXT_PUBLIC_CONTACT_EMAIL`). Hai trang pháp lý đang trỏ tới địa chỉ này;
      trang chính sách trỏ tới hộp thư không tồn tại còn tệ hơn không có trang.
- [ ] Đọc lại 2 trang pháp lý và chỉnh cho khớp thực tế pháp nhân của bạn
      (hiện chưa nêu tên công ty / mã số thuế — chưa có thì thôi, nhưng nếu có
      thì nên ghi).
- [ ] Tự host ảnh hero: `app/(public)/page.tsx:79` vẫn hot-link Unsplash — LCP
      của trang chuyển đổi chính phụ thuộc CDN bên thứ ba và là ảnh stock. Cần
      một ảnh thật (buổi tập ở phòng gym VN càng tốt) — tôi không tạo được ảnh
      này hộ bạn.

---

## Nhóm D — Làm dần (không chặn gì)

- [x] **SEO structured data** — **đã làm xong 2026-08-20**, xem mục "SEO + GEO
      tầng thương hiệu" ở trên: `Person` → `LocalBusiness` + `Offer`/`priceRange`,
      `Organization` JSON-LD ở layout gốc, SSR 5 đánh giá đầu, thêm `FAQPage` ở
      `/for-trainers` và đoạn định nghĩa thực thể.
      *(Thẻ `twitter:` thì Next đã tự sinh từ `openGraph` — đã kiểm chứng.)*
- [x] **`gender: "other"`** render chuỗi tiếng Anh thô — **đã sửa 2026-08-20**:
      thêm `other: "Khác"` vào `GENDER_LABELS` + helper `genderLabel()` (fallback
      humanize thay vì trả giá trị thô).
- [x] **Specialty tự do leak slug thô** (`cross_fit`) vào badge, meta description
      và JSON-LD — **đã sửa 2026-08-20**: `specialtyLabel()` fallback qua
      `humanizeSlug()` (`cross_fit` → `Cross Fit`). Backend cố ý cho phép chuyên
      môn tự do (`_SLUG_RE` ở `schemas/pt.py`), nên đây là dữ liệu hợp lệ chứ
      không phải rác — chỉ thiếu chỗ dịch sang chữ đọc được. Regex chỉ nhận ASCII
      nên viết hoa từng từ luôn an toàn.
- [ ] Bộ lọc `/pts` trên mobile: 7 control stack trên kết quả — thu thành nút
      "Bộ lọc" mở drawer.
- [ ] Sort thêm "Mới nhất".
- [ ] Kanban lead: ô ghi chú per-lead (giữ nhỏ, chưa phải CRM).
- [x] **Icon check xanh cạnh chứng chỉ** ám chỉ "đã xác thực" — **đã sửa
      2026-08-20**: đổi sang icon tài liệu trung tính, màu `slate-400`. Dấu tích
      xanh là ngôn ngữ hình ảnh của "đã xác thực", còn điều khoản nói rõ PTMatch
      KHÔNG xác minh chứng chỉ. `ListingChecklist` **giữ nguyên** dấu tích xanh —
      ở đó nó báo một trạng thái hệ thống thật biết, nên đúng.
- [ ] **`users.zalo_user_id` không có đường GHI** — đã kiểm: nó chỉ được đọc ở
      `channels/zalo.py`, `notify.py`, `jobs/lead_reminders.py`, không chỗ nào
      gán. Nghĩa là dù bật `NOTIFY_CHANNELS=zalo_oa` thì kênh luôn trả `skipped`
      và im lặng rơi xuống email. Cần webhook `follow` của Zalo OA (hoặc lấy từ
      luồng đăng nhập Zalo) ghi giá trị này thì kênh mới sống.
- [ ] **Nâng `next` lên ≥ 15.5.21** — đang chạy 15.5.19, dính một advisory mức
      cao có từ trước. `package.json` để `^15.3.3` nên chỉ cần cập nhật lockfile.
- [ ] i18n phần còn lại (cố ý hoãn, không chặn gì): 6 file admin; nhãn dùng
      chung trong `lib/constants.ts`; backend chưa đọc `Accept-Language`; giá trị
      ngân sách đang lưu dưới dạng chuỗi hiển thị nên không dịch được nếu không
      migrate.
- [ ] Nhiều gói giá linh hoạt hơn (hiện cố định per_session/12/24/36) —
      **bạn đã hoãn**: "để lại sau khi có PT thật đã".
- [ ] **Danh sách phòng tập có sẵn thay input tự do `gym_name`** — **bạn đã hoãn
      (2026-08-20)**: "để cho tự do nhập như hiện tại đã, nào có user thì apply".
      Khi làm: JSON tự host theo đúng pattern `public/vn-locations/` (~50-100
      phòng thật ở TP.HCM + Đồng Nai), rồi một migration gộp alias giống
      alembic `0012` đã làm cho tên tỉnh. **Dấu hiệu nên làm:** bắt đầu có PT
      thật nhập tên phòng, hoặc thấy bộ lọc/hiển thị bị lệch vì trùng tên khác
      cách viết. Đây cũng là bước mở đường cho sort theo khoảng cách sau này
      (gắn lat/lng vào từng phòng trong danh sách — xem mục Google Maps ở dưới).

---

## Cố tình KHÔNG làm ở giai đoạn này

FAQ dài, trang testimonial, blog SEO, chat, booking, payment, so sánh PT,
app mobile, CRM nâng cao, verified-badge CCCD — tất cả sau gate giai đoạn 3.

Nhắc lại 4 quyết định đã chốt (đừng vô tình đảo):
- **GA4 trực tiếp, không qua GTM** — `NEXT_PUBLIC_GTM_ID` giữ rỗng.
- **`MASK_LEAD_PHONE` giữ tắt** cho tới giai đoạn test thu tiền — bật sớm thì
  PT không liên hệ được ai và mất luôn phép đo (chưa có đường unlock nào trong
  code).
- **KHÔNG tích hợp Google Maps API** (quyết định 2026-08-20). Lý do: nút thắt là
  cold start (có cung/cầu hay chưa), không phải độ chính xác ghép đôi — map cải
  thiện thứ chỉ thành vấn đề *sau khi* đã có thanh khoản. Kèm theo là tài khoản
  billing, hạn mức, bundle JS nặng trên đúng trang chuyển đổi, và phải sửa trang
  chính sách bảo mật (Google nhận IP/hành vi người xem).
  **Điểm cần nhớ khi xét lại:** sort theo khoảng cách **không cần Maps API** —
  chỉ cần toạ độ. Geocode một danh sách phòng tập có sẵn *một lần, offline*, lưu
  lat/lng rồi tính trong Postgres là đủ; Maps API chỉ thật sự cần cho autocomplete
  địa điểm bất kỳ và render bản đồ tương tác (mà bản đồ chỉ để *hiển thị* thì
  Leaflet + OpenStreetMap miễn phí, không cần billing).
- **`gym_name` giữ nguyên input tự do** (quyết định 2026-08-20) — không làm danh
  sách phòng tập có sẵn bây giờ. Sau khi đổi ward/city sang `LocationSelect`, đây
  là trường địa điểm tự do duy nhất còn lại, nên có bất nhất kiểu
  "California Fitness" / "Cali Fitness" / "California Fitness & Yoga" là chuyện
  chắc xảy ra. Vẫn hoãn vì **chi phí dọn tỉ lệ với số dòng, mà hiện chưa có dòng
  nào** — làm sớm là trả giá trước cho một vấn đề chưa tồn tại. Xem nhóm D.
