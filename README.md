# PTMatch

Nền tảng kết nối học viên với Personal Trainer (PT) — giúp PT xây dựng thương hiệu cá nhân, nhận lead và quản lý khách hàng.

📄 Tài liệu: [Product Spec](PTMatch_Product_Spec.md) · [Implementation Plan](plan-build.md)

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Frontend | Next.js 15 (App Router, SSR cho SEO) + React 19 + Tailwind CSS |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 async |
| Database | PostgreSQL 16 (full-text search tsvector + unaccent) |
| Cache / Rate limit | Redis 7 |
| Storage | GCS + Cloud CDN (production) / local disk (dev) |
| Infra | GCP (GCE, GCS, CDN, DNS) managed bằng Terragrunt — xem [infra/README.md](infra/README.md) |
| CI/CD | Cloud Build → Artifact Registry → deploy lên GCE |

## Chạy local (dev)

Yêu cầu: Docker + Docker Compose.

```bash
cp .env.example .env        # chỉnh nếu cần, default chạy được ngay
make dev                    # = mkdir media + docker compose up --build
make seed                   # tạo dữ liệu demo (9 PT, reviews, leads)
```

| URL | Mô tả |
|---|---|
| http://localhost:3000 | Frontend (landing, tìm PT, profile, dashboard) |
| http://localhost:8000/docs | API docs (Swagger) |
| http://localhost:8000/api/health | Health check |

**Tài khoản demo PT:** `pt@ptmatch.vn` / `password123` → đăng nhập rồi vào Dashboard.

Lệnh thường dùng: `make up` / `make down` / `make logs` / `make migrate` / `make test`.

### Trình duyệt gọi API cùng origin

`NEXT_PUBLIC_API_URL` để **trống** ở mọi môi trường. Trình duyệt gọi `/api/...`
ngay trên origin đang mở trang, `next.config.ts` rewrite xuống
`API_INTERNAL_URL` (`http://backend:8000`). SSR vẫn gọi thẳng backend, không
qua proxy.

Đổi cổng frontend (VD `-p 3001`) hay mở site từ IP LAN, máy khác, tunnel đều
chạy — và không có CORS ở đường trình duyệt. Ghi cứng `http://localhost:8000`
vào biến này là cách chắc chắn nhất để nhận "Không thể kết nối tới máy chủ":
trang tải được từ cổng bạn đang mở, còn `localhost:8000` thì trỏ về máy của
người xem.

Chỉ điền biến này khi API tách hẳn sang domain riêng — lúc đó phải mở
`CORS_ORIGINS` bên backend cho origin của frontend.

## Cấu trúc project

```
ptmatch/
├── frontend/          # Next.js 15 — pages public (SSR/SEO) + PT dashboard
├── backend/           # FastAPI — API /api/*, models, Alembic migrations, seed
├── infra/             # Terragrunt/Terraform — network, compute, storage, cdn, dns
├── nginx/             # Nginx config cho production (reverse proxy + SSL)
├── scripts/           # setup-server.sh, deploy.sh, backup-db.sh
├── docker-compose.yml          # Dev stack (hot reload)
├── docker-compose.yml          # Base stack = PRODUCTION (server dùng file này)
├── docker-compose.override.yml # Máy dev (Compose tự nạp khi không có -f)
└── cloudbuild.yaml             # CI/CD pipeline
```

## Bảo mật & session

- **JWT**: access token ngắn hạn + refresh token **xoay vòng** — mỗi lần `/api/auth/refresh`
  token cũ bị thu hồi ngay (denylist theo `jti` trong Redis). `/api/auth/logout` thu hồi
  refresh token; access token còn lại hết hạn theo `ACCESS_TOKEN_EXPIRE_MINUTES`.
- **SECRET_KEY**: khi `ENVIRONMENT=production`, app **từ chối khởi động** nếu key là giá trị
  mẫu hoặc ngắn hơn 32 ký tự. Sinh key: `openssl rand -hex 32`.
- **Rate limit** (slowapi + Redis): login 10/phút, register 10/giờ, refresh 30/phút,
  lead 5/phút·30/giờ, review 5/phút·20/giờ, đếm view 30/phút.
- **middleware.ts** chỉ là redirect cho UX (cookie `pt_session` do client ghi, có thể giả
  mạo). Ranh giới bảo mật thật luôn là Bearer token do backend kiểm tra.
- **Upload**: `POST /api/upload/presign` → PUT. Ở chế độ `gcs` dùng signed URL; ở chế độ
  `local` endpoint yêu cầu đăng nhập và chỉ cho ghi vào prefix `uploads/<user_id>/` của
  chính mình.

## Đo lường (phễu chuyển đổi)

Phễu được đo bằng 4 sự kiện, định nghĩa tập trung ở `frontend/lib/analytics.ts`:

| Sự kiện | Bắn khi | Cho biết |
|---|---|---|
| `search_pts` | Trang kết quả tìm kiếm render | Người dùng đến từ đâu, lọc theo gì, ra bao nhiêu kết quả |
| `view_pt_profile` | Mở hồ sơ PT | Hồ sơ nào hút, hồ sơ nào không |
| `lead_form_start` | Gõ ký tự đầu vào form | Tỷ lệ rơi giữa xem và bắt đầu điền |
| `lead_submit_success` | Gửi lead thành công | **Chỉ số quan trọng nhất.** Kèm sự kiện chuẩn `Lead` của Facebook để quảng cáo tối ưu theo chuyển đổi thật |
| `lead_cta_mobile_click` | Bấm thanh CTA ghim đáy trên mobile | Lối tắt tới form có được dùng không — trên mobile form nằm cuối trang |
| `empty_search_to_request` | Bấm "Đăng yêu cầu" từ màn hình tìm kiếm 0 kết quả | Chợ ngược có cứu được nhu cầu mà nguồn cung chưa đáp ứng nổi không |

Cấu hình trong **`frontend/.env.production`** (và `frontend/.env.development` cho `next dev`) — để trống thì **không script nào được nạp**, nên dev/preview không làm bẩn số liệu:

- `NEXT_PUBLIC_GA_ID` — GA4 trực tiếp
- `NEXT_PUBLIC_GTM_ID` — dùng GTM thay thế; khi đặt biến này, GA4 trực tiếp tự tắt để không đếm hai lần
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_FB_PIXEL_ID`

`track()` luôn push vào `window.dataLayer`, nên gắn GTM về sau chỉ cần thêm container, không phải sửa chỗ gọi nào.

Ba điều dễ vấp:

1. **Nhúng lúc build, không phải lúc chạy.** Đổi giá trị phải **build lại image frontend**; restart không đủ.
2. **Biến rỗng trong môi trường vẫn thắng file.** Nếu `NEXT_PUBLIC_GA_ID=` tồn tại trong `environment` của container thì nó ghi đè `.env.production` và script sẽ không bao giờ nạp. Đó là lý do `docker-compose.yml` không khai báo các biến này.
3. **`components/Analytics.tsx` phải là client component.** Là server component thì giá trị bị đọc từ `process.env` lúc chạy, và `.env.production` mất tác dụng.

Các biến này là ID công khai (ai mở DevTools cũng thấy), nên để trong repo là hợp lệ. Secret của backend vẫn nằm ở `.env` thư mục gốc và bị `.dockerignore` chặn khỏi image frontend.

## Bảng "Học viên cần PT" (chợ ngược)

Luồng mặc định là học viên xem hồ sơ rồi gửi yêu cầu cho **một** PT. Khi nguồn cung còn mỏng,
xác suất tìm đúng người hợp cả giá lẫn khu vực rất thấp, và mỗi lần không hợp là mất luôn nhu
cầu đó. Chiều ngược lại giải bài toán này: học viên đăng nhu cầu một lần tại `/requests/new`,
mọi PT phù hợp nhìn thấy trên `/requests` và chủ động nhận.

| Endpoint | Mô tả |
|---|---|
| `POST /api/requests` | Đăng yêu cầu (công khai, rate limit 3/giờ) |
| `GET /api/requests` | Bảng yêu cầu còn nhận được — lọc theo chuyên môn, quận, ngân sách, giới tính |
| `GET /api/requests/mine` | Yêu cầu của chính học viên, kèm danh sách PT đã lấy liên hệ |
| `POST /api/requests/{id}/claim` | PT nhận yêu cầu → tạo Lead trong dashboard của họ |
| `PATCH /api/requests/{id}/close` | Học viên đóng, **kèm lý do bắt buộc** (`found_pt` / `no_longer_needed`) |

Bốn quyết định thiết kế:

- **Số điện thoại không nằm trong dữ liệu công khai của bảng.** PT phải nhận thì mới có, và số
  nằm trong Lead của riêng họ (chịu cả `MASK_LEAD_PHONE`). Đây chính là ranh giới sẽ đặt cổng
  thu phí khi bán gói nhận lead. Cột `contact_other` (link Facebook / nick Zalo) được bảo vệ y
  hệt: vắng mặt trong mọi schema trả ra công khai, chỉ xuất hiện trong `Lead.goal` sau khi nhận.
- **Nhận yêu cầu = tạo một `Lead` trỏ ngược về yêu cầu** (`leads.request_id`). Nhờ vậy toàn bộ
  Kanban, thông báo và thống kê phản hồi sẵn có dùng lại được mà không phải sửa gì. Lượt nhận
  cũng bắn thông báo cho chính PT (`is_claim`, nội dung riêng — họ vừa bấm nút nên đây không
  phải báo tin mà là gửi số để gọi từ điện thoại), nhờ đó phễu chợ ngược cũng có bản ghi
  trong `notification_deliveries` như lead đến từ form.
- **Không giới hạn số PT nhận một yêu cầu.** Một PT chỉ nhận được một lần (chỉ số duy nhất
  `(request_id, pt_profile_id)`), nhưng không có trần. Xem "Vì sao bỏ trần suất" bên dưới.
- **Yêu cầu hết hạn sau 14 ngày** (`REQUEST_LIFETIME_DAYS`). Bảng đầy yêu cầu cũ làm PT mất
  niềm tin, và học viên lúc đó hầu như đã chọn được người khác.

`/requests` và `/requests/new` để **noindex** — nội dung chứa thông tin người thật và chỉ sống
14 ngày, không có lý do gì để Google lập chỉ mục.

### Form đăng yêu cầu chỉ có bốn ô

Bài đăng thật trong các group Facebook cho thấy người ta nêu **khung giờ**, **chi nhánh phòng
tập** và tiêu chí chất lượng, nhưng gần như không bao giờ nhắc tới ngân sách hay giới tính PT.
Nên form chỉ bày ra: họ tên, số điện thoại, khu vực, mô tả. Các trường còn lại nằm trong
`<details>` "Thêm chi tiết" — chúng vẫn nuôi bộ lọc bên phía PT nhưng không chặn đường người
đang muốn đăng. Placeholder của ô mô tả chính là format bài đăng quen thuộc: đó là cách rẻ nhất
để xin được khung giờ và tên phòng tập mà không phải thêm trường dữ liệu nào.

### Block "Học viên đang tìm PT" trên trang chủ

Đối tượng của block này là **PT chứ không phải học viên**: một PT lạc vào trang chủ mà thấy vài
người có thật đang cần người ở quận của mình thì đó là lý do đăng ký hồ sơ mạnh hơn mọi câu
quảng cáo — khoe cầu để kéo cung khi chợ còn mỏng. Bố cục một dòng mỗi yêu cầu (kiểu diễn đàn)
vì số dòng nhiều mới là thứ cần khoe; mốc thời gian và số PT quan tâm chứng minh chợ đang sống.

Hai điều cần biết khi sửa `components/HomeRequests.tsx`:

- Trang chủ **được Google lập chỉ mục**, khác `/requests`. Nên block chỉ hiện **tên riêng**
  (`givenName()` — tiếng Việt tên chính nằm ở cuối) và mô tả cắt còn 90 ký tự.
- Dưới `MIN_ROWS = 3` yêu cầu đang mở thì ẩn danh sách, thay bằng thẻ mời đăng. Một danh sách
  hai dòng trông như trang chết, thà không có còn hơn.

### Vì sao bỏ trần suất

Từng có `MAX_CLAIMS_PER_REQUEST` (3, sau đó nới lên 10) với lý do "học viên không bị chục PT gọi
cùng lúc". Đã **bỏ hẳn** cùng với `slots_left` và mọi câu chữ "còn N suất".

Nó chặn nhầm đại lượng. Bấm nhận chỉ là lấy số điện thoại — không phải liên hệ, càng không phải
chốt. Bảng lại lọc `claim_count < trần`, nên đủ trần là yêu cầu **biến mất khỏi bảng** ngay cả
khi chưa PT nào gọi: học viên chờ vô ích, PT đến sau không còn thấy nó. Với tỉ lệ chốt 30% thì
hơn một phần ba yêu cầu chết âm thầm theo đúng cách đó. Trần tạo trạng thái chết chứ không bảo
vệ ai.

Còn lại:

- `claim_count` vẫn đếm, nhưng **chỉ dùng cho số liệu**, không hiện ở chỗ công khai nào.

### Không hiện số PT đã lấy liên hệ

`/requests` và trang chủ đều không hiện con số này. Đã thử "còn N suất", rồi "N PT đã nhận", rồi
"N PT quan tâm" — cả ba đều sai cùng một kiểu: con số đó **người xem không làm gì được với nó**.
PT biết có 5 người quan tâm cũng không đổi được quyết định, chỉ chùn tay. Học viên đọc "5 PT
quan tâm" thì tưởng việc đã xong, dù có thể chưa ai gọi — bấm nút không phải là gọi điện, và
`claim_count` không bao giờ biết được điều đó.

Thứ đóng một yêu cầu là **học viên bấm nút**, không phải bộ đếm. Nên con số ở lại đúng hai chỗ nó
có ích:

- `/account/requests` — học viên xem **danh sách PT** đang giữ liên hệ của mình (cụ thể, kèm hồ
  sơ, không phải một điểm số), với dòng *"Những PT này đã xem số điện thoại của bạn và có thể
  liên hệ."* Đó là thông tin về dữ liệu của chính họ.
- `GET /api/requests/stats` — số liệu vận hành.

### Hai nút đóng, không phải một

Học viên có hai lựa chọn: **"Đã tìm được PT"** và **"Không còn nhu cầu"** (`close_reason`,
migration `0008`). Lý do là **bắt buộc** — đóng mà không biết vì sao thì mất luôn tín hiệu chuyển
đổi duy nhất do chính người có nhu cầu khai.

Vì sao không tin `requests_won` (đếm lead `closed`): trạng thái lead do **chính PT tự khai**. PT
quên chuyển cột trên Kanban thì `requests_won = 0` dù đã có người tập thật. Còn học viên bấm "đã
tìm được PT" thì đó là kết quả không ai khai hộ được.

Hai lý do tách riêng vì dẫn tới hai việc làm khác nhau: `closed_found_pt` lên là bằng chứng đi
tiếp; `closed_no_longer_needed` nhiều thì phải hỏi tại sao — chờ lâu, PT gọi không hợp, hay tự
tìm được ở nơi khác. `close_reason` **không có** trong schema công khai của bảng.
- Yêu cầu rời bảng **chỉ khi** học viên bấm đóng hoặc hết 14 ngày.
- Điều kiện `status = open AND expires_at > now()` vẫn nằm trong chính câu `UPDATE` lúc nhận, để
  học viên đóng đúng lúc PT bấm nhận thì không lọt.
- Ranh giới thu phí **không đổi**: nó nằm ở hành động "nhận", không ở số suất.

Mở lại trần chỉ khi `GET /api/requests/stats` cho thấy `claims_total / requests_claimed` cao mà
học viên phàn nàn bị gọi nhiều — bằng dữ liệu, không bằng phỏng đoán.

### Số liệu phễu chợ ngược (`GET /api/requests/stats`, admin)

Tách **bấm nhận** khỏi **liên hệ thật**. Không có nó thì tiêu chí dừng của giai
đoạn kiểm chứng đo nhầm số: bảng đầy yêu cầu "đã có PT nhận" trong khi chưa ai
tập với ai.

| Trường | Nghĩa | Nguồn |
|---|---|---|
| `requests_posted` | Số yêu cầu đăng | `trainee_requests` |
| `requests_claimed` | Có ≥1 PT bấm nhận | có lead với `request_id` |
| `requests_contacted` | Có ≥1 PT thật sự động tới | lead có `first_response_at` |
| `requests_won` | Có ≥1 lead chốt | lead `status = closed` |
| `requests_expired_unclaimed` | Hết hạn, không ai nhận | `claim_count = 0` |
| `claims_total` | Tổng số lần nhận | đếm lead |
| `closed_found_pt` | **Học viên tự xác nhận tìm được PT** | `close_reason` |
| `closed_no_longer_needed` | Học viên bỏ nhu cầu | `close_reason` |

Chỗ tụt mạnh nhất là việc cần làm tiếp:

- `posted → claimed` tụt → **thiếu PT**, hoặc không ai vào bảng.
- `claimed → contacted` tụt → PT lấy số rồi không gọi. Vấn đề nằm ở PT, không ở
  bảng — nhắc PT hoặc lọc PT, chứ đừng chặn lượt nhận.
- `contacted → won` tụt → gọi rồi nhưng ghép đôi sai (giá, khu vực, khung giờ);
  thêm lưu lượng không cứu được.

Hai dòng cuối là con số đáng tin nhất trong bảng, vì chỉ chúng do **người có nhu cầu** khai chứ
không phải PT. Đối chiếu tiêu chí dừng của giai đoạn kiểm chứng với `closed_found_pt`, đừng dùng
`requests_won`.

`?days=30` để xem cửa sổ thời gian; không truyền là toàn thời gian.

Admin không đăng ký được qua API (`schemas/auth.py` chỉ nhận `pt`/`trainee`) —
nâng quyền bằng SQL: `UPDATE users SET role='admin' WHERE email='...'`.

## Đăng ký tự phục vụ (SNS) và vai trò

Vai trò (`pt` / `trainee`) chỉ được ghi **một lần duy nhất**, lúc tạo user. Điều đó từng
tạo ra một cái bẫy không lối thoát: trang `/login` có bộ chọn vai trò mặc định là "học
viên", nên một PT tới từ group Facebook bấm "Đăng nhập với Facebook" ở đó sẽ thành học
viên — không hồ sơ, không đăng được gì, và đường sửa duy nhất là chạy SQL tay.

Ba thay đổi khoá cái bẫy đó lại:

- **`/login` không còn bộ chọn vai trò.** Với đăng nhập bằng mật khẩu nó vốn không làm gì
  (vai trò lấy từ tài khoản); với nút SNS thì nó quyết định vĩnh viễn loại tài khoản được
  tạo. Người đang đăng nhập cũng không có lý do gì phải khai lại mình là ai.
- **`POST /api/auth/oauth/exchange` trả thêm `is_new`.** Tài khoản vừa được tạo thì frontend
  đưa thẳng tới `/welcome` để hỏi vai trò, thay vì đoán. Trường này bị `response_model`
  lọc mất là hỏng trong im lặng — endpoint vẫn 200, chỉ thiếu đúng nó, nên có test riêng.
- **`POST /api/auth/become-pt`** chuyển học viên sang PT và tạo hồ sơ (idempotent). Đây là
  van an toàn: kể cả khi ai đó vẫn tạo nhầm tài khoản, không bao giờ phải mở SQL nữa. Nó
  cấp lại token vì token cũ mang `role: trainee` trong payload.

`/welcome` cố ý chỉ có **hai bước**: xác nhận vai trò, rồi hai ô còn thiếu để hồ sơ hiển
thị được (giá + khu vực). Ảnh đại diện lấy sẵn từ nhà cung cấp OAuth —
`_create_pt_profile()` chép `users.oauth_avatar_url` sang `pt_profiles.avatar_url`, nên
một trong ba điều kiện publish được thoả ngay tại giây đăng ký. Mọi thứ còn lại (bio,
chứng chỉ, portfolio, các gói 12/24/36) là làm giàu hồ sơ, không chặn publish, và được
nhắc dần bằng `ListingChecklist` trong dashboard — không dựng wizard nhiều bước cho hai ô.

## Quên mật khẩu

`POST /api/auth/forgot-password` → `POST /api/auth/reset-password`, token một lần trong
Redis, hạn 30 phút, tiêu huỷ ngay lúc đọc (`GETDEL`).

- **Luôn trả 202**, kể cả email không tồn tại: phân biệt hai trường hợp là biếu không công
  cụ dò xem địa chỉ nào đã đăng ký (cùng lý do với `_authenticate`).
- Tài khoản chỉ có OAuth (không có `password_hash`) nhận thư chỉ đường về nút đăng nhập
  tương ứng, thay vì im lặng để họ ngồi đợi mãi.
- Đặt lại xong thì đăng nhập luôn — bắt gõ lại mật khẩu vừa đặt ở màn hình kế tiếp chỉ
  thêm một chỗ rơi mà không đổi lại được gì về bảo mật.
- Thư giao dịch đi qua `app/services/mailer.py`, dùng chung SMTP với kênh thông báo lead
  nhưng **không** đi qua chuỗi kênh dự phòng: không có Zalo nào thay thế được một đường
  link bí mật. `MailResult.error` giữ nguyên thông điệp lỗi SMTP để
  `GET /admin/lead-ops` còn chẩn đoán được — nuốt nó thành câu chung chung thì sai mật
  khẩu SMTP và domain bị chặn trông y hệt nhau.

## Đa ngôn ngữ (i18n)

Hiện chỉ có tiếng Việt, nhưng **mọi chuỗi hiển thị đều đi qua catalog** — thêm ngôn ngữ là
dịch một file JSON, không phải đi sửa lại từng component.

| Thứ | Ở đâu |
|---|---|
| Danh sách ngôn ngữ, `resolveLocale()` | `i18n/config.ts` |
| Nạp catalog theo request | `i18n/request.ts` |
| Chuỗi | `messages/<locale>.json` |

Server component dùng `getTranslations("ns")`, client component dùng `useTranslations("ns")`.
Chữ có định dạng lồng bên trong dùng `t.rich()` với thẻ (`<b>`, `<em>`…).

### Thêm ngôn ngữ thứ hai — đúng ba việc

1. Thêm mã vào `LOCALES` và tạo `messages/<mã>.json`.
2. Bật định tuyến next-intl với `localePrefix: "as-needed"`: tiếng Việt (mặc định) giữ URL
   trần, ngôn ngữ mới nhận tiền tố `/en/...`. Nhờ vậy **mọi link đã chia sẻ và mọi trang
   Google đã lập chỉ mục không gãy** — đó là lý do hôm nay chưa có tiền tố `/vi`.
3. Thêm `hreflang` vào `alternates.languages` ở metadata gốc.

`resolveLocale()` là chỗ duy nhất quyết định ngôn ngữ; lúc đó chỉ sửa đúng hàm này để đọc từ
URL / cookie / `Accept-Language`.

### Catalog gửi xuống trình duyệt được phân vùng

`NextIntlClientProvider` tuần tự hoá mọi thứ ta đưa vào nó thành payload của **trang**. Đưa cả
catalog vào là trang chủ phải cõng toàn văn chính sách bảo mật và mọi chuỗi của dashboard —
đo thật: `/for-trainers` từng nặng 123KB HTML vì chuyện đó, sau khi phân vùng còn 114KB.

- `SERVER_ONLY_NAMESPACES` — văn bản dài và metadata, chỉ server component đọc. Không gửi.
- `AUTH_ONLY_NAMESPACES` — chỉ dùng sau khi đăng nhập. Layout gốc không gửi; `app/dashboard/layout.tsx`
  và `app/account/layout.tsx` là **server component** bọc thêm một provider để cấp lại.
  Vỏ giao diện của hai khu đó nằm ở `components/DashboardShell.tsx` / `AccountShell.tsx` vì
  chúng là client component.
- Provider lồng nhau **thay thế** context chứ không gộp, nên `authMessages()` phải trả về cả
  phần dùng chung.

Cố ý dùng **danh sách loại trừ**, không phải danh sách cho phép: bản đầu liệt kê namespace
được phép gửi và nó hỏng ngay lần thêm namespace kế tiếp — quên một dòng là client component
mất chuỗi và **trang trắng sau khi hydrate**, mà server vẫn render đúng nên lỗi không lộ ra ở
HTML nguồn. Chiều này quên thì chỉ nặng thêm vài KB.

### Ba cái bẫy đã gặp

1. **Số truyền vào `t()` bị ICU định dạng theo locale.** `{year}` nhận `2026` ra `"2.026"` ở
   vi-VN. Truyền chuỗi khi đó là số hiệu chứ không phải số lượng (năm, mã, min-length).
2. **Hàm thuần ngoài component không gọi được hook.** `collectImages()`, `budgetText()`,
   `summarize()` nhận `t` qua tham số.
3. **Biến lặp tên `t`.** `app/dashboard/portfolio/page.tsx` từng có `.map((t) => …)` che mất
   hàm dịch — đã đổi thành `kind`.

### Chưa chuyển (cố ý)

- **`/admin/*` và `AdminShell`** — công cụ nội bộ chỉ founder dùng, sẽ không cần ngôn ngữ khác.
- **`value=` của ô ngân sách trong `LeadForm`** — chuỗi đó được LƯU vào `Lead.budget` và PT đọc
  trực tiếp, tức là **dữ liệu chứ không phải nhãn**. Muốn đa ngôn ngữ thật sự phải đổi sang mã
  ổn định (`under_300k`…) ở cả backend.
- **Nhãn dùng chung trong `lib/constants.ts`** (chuyên môn, giới tính, trạng thái lead, sắp xếp)
  — cần tách slug khỏi nhãn, nhưng `specialtyLabel()` được gọi từ hàng chục chỗ gồm cả
  `generateMetadata`, nên là một refactor riêng.
- **Thông báo lỗi và email từ backend** vẫn cứng tiếng Việt. Cần `Accept-Language` phía API —
  người dùng ngôn ngữ khác sẽ thấy lỗi tiếng Việt cho tới khi làm việc đó.

## Kênh thông báo: email trước, Zalo/Facebook sau

### Thử ở dev mà không gửi thư thật

Stack dev có sẵn **Mailpit** — một máy chủ SMTP giả giữ lại mọi thư. Đặt trong `.env`:

```
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USE_TLS=false
NOTIFY_CHANNELS=email,log
```

rồi `docker compose up -d` và mở **http://localhost:8025** để đọc thư. Nhờ vậy kiểm chứng
được trọn đường ống (tạo lead → soạn thư → gửi) trước khi trả tiền cho nhà cung cấp nào.

Nhớ: đổi `.env` phải `docker compose up -d backend`, **không phải `restart`** — biến môi
trường gắn vào container lúc nó được *tạo*, `restart` chỉ khởi động lại tiến trình cũ.


Thứ tự này là **quyết định**, không phải tạm bợ.

| Kênh | Phủ được ai | Vướng gì |
|---|---|---|
| **Email** | 100% PT có email thật | Chỉ cần điền `SMTP_*`. Làm được ngay, miễn phí |
| Zalo OA (`oa/message/cs`) | chỉ PT **đã quan tâm OA** | Cần OA xác thực (giấy phép kinh doanh) **và** `users.zalo_user_id` — cột này hiện **không có chỗ nào ghi**, nên kênh đang chết dù có token |
| Zalo ZNS | 100% (gửi theo SĐT) | Cần OA xác thực + template Zalo duyệt + **trả phí mỗi tin** |
| Facebook Messenger | chỉ người **đã nhắn Page trước** | **Chưa có kênh nào trong code.** Cần Page + `pages_messaging` + App Review |

Điểm chung của mọi nền tảng nhắn tin: **người nhận phải chủ động kết nối trước**. Không có
đường tắt, và đó là lý do email là kênh duy nhất phủ được mọi PT từ ngày đầu.

Khi thêm Zalo về sau, nhắm **ZNS** chứ không phải OA messaging — chain đã sẵn sàng cho việc
đó: `NOTIFY_CHANNELS=zns,email,log` thử ZNS trước, ai không gửi được thì rơi xuống email.

### Tài khoản mạng xã hội không có email thật

Zalo **không trả email**, Facebook thì người dùng **từ chối chia sẻ được**. Những tài khoản đó
nhận một địa chỉ tự sinh trên tên miền không tồn tại (`services/identity.py`), để giữ ràng
buộc NOT NULL/UNIQUE của `users.email`.

Ba chỗ phải biết về địa chỉ đó:

1. **Không gộp tài khoản** theo nó (`api/auth.py`) — nó không chứng minh ai sở hữu cái gì.
2. **Không gửi thư tới nó.** Kênh email trả `skipped` kèm lý do, **không phải** `sent`. Nếu
   báo thành công thì `notification_deliveries` nói PT đã được thông báo trong khi họ chưa hề
   biết có lead — ta sẽ kết luận nhầm là "PT lười không gọi".
3. **Hỏi email thật ở `/welcome`.** `UserOut.needs_email` là cờ do backend tính; frontend
   không tự đoán theo tên miền.

`POST /api/auth/set-email` **chỉ** đặt được khi địa chỉ hiện tại là địa chỉ tự sinh. Đây
không phải chức năng "đổi email": mở cho mọi tài khoản đổi tự do là mở đường chiếm tài khoản
— mượn được phiên đăng nhập một lúc là đổi email rồi chiếm bằng quên-mật-khẩu. Muốn đổi email
thật thì cần luồng xác minh riêng.

## Điều kiện hiển thị hồ sơ

Đăng ký xong là `PTProfile` đã có `is_active = True`, nên một tài khoản vừa tạo — không
ảnh, không giá, không khu vực — từng đứng ngay trên `/pts` và trong sitemap. Vài hồ sơ như
vậy xen giữa hồ sơ thật là đủ để người xem kết luận cả trang là chợ rác, và đó là ấn tượng
đắt nhất trong giai đoạn đang mua lưu lượng.

`app/services/listing.py` giữ **một** định nghĩa "đủ điều kiện hiển thị":

| Yêu cầu | Vì sao |
|---|---|
| Còn hoạt động (`is_active`) | PT tự tắt được trong dashboard khi đã kín lịch |
| Có ảnh đại diện | Thẻ PT không có ảnh trông như hồ sơ bỏ hoang |
| Có giá theo buổi > 0 | Giá là thông tin chính trên thẻ; `0` là chưa điền, không phải "miễn phí" |
| Có ≥1 khu vực hoạt động | Không có khu vực thì không lọc được, mà lọc theo quận là đường tìm chính |

Ba điều cần biết:

- Áp cho `GET /api/pts` và `GET /api/pts/sitemap`, **không** áp cho `GET /api/pts/{slug}`.
  Link đã chia sẻ thì không được gãy, và PT phải xem trước được trang của mình.
- `listable_clause()` (SQL) và `missing_listing_requirements()` (Python) là **cùng một
  quy tắc viết hai lần** — sửa một cái phải sửa cái kia, nếu không dashboard sẽ báo "hồ sơ
  đã hiển thị" trong khi truy vấn vẫn loại nó ra. Chúng nằm cạnh nhau đúng vì lý do đó.
- `GET|PUT /api/pts/me` trả `missing_listing`; dashboard dựng checklist từ đó chứ không tự
  đoán lại luật. Không có khối này thì PT không có cách nào biết vì sao mình không xuất
  hiện, và sẽ kết luận nhầm là nền tảng không có người dùng.

Bảng giá trên hồ sơ công khai chỉ dựng những gói **có giá** — trước đây luôn đủ bốn thẻ, nên
PT chưa nhập gói nào thì hồ sơ hiện một hàng bốn ô "—", trông như trang hỏng đúng chỗ người
xem đang cân nhắc trả tiền.

## Đánh giá: hiển thị ngay, xử lý sau

Đánh giá lên hồ sơ **ngay khi gửi** — không có hàng chờ duyệt.

Đã từng có (alembic `0015` thêm `approved_at`), và đã bỏ: hàng chờ chỉ có nghĩa khi ngày nào
cũng có người mở `/admin/reviews`. Với đăng ký tự phục vụ thì không ai đảm bảo được điều đó,
và một hàng chờ không ai trực nghĩa là **đánh giá thật không bao giờ xuất hiện** — tệ hơn hẳn
so với thi thoảng lọt một cái giả. Chống giả mạo vẫn còn ở chỗ nó vốn ở: mỗi đánh giá ẩn danh
tốn một số điện thoại khác nhau (chỉ mục duy nhất `uq_reviews_pt_anon_phone`), PT không tự
đánh giá mình được, và rate limit 5/phút·20/giờ.

`approved_at` ở lại với nghĩa **"đang hiển thị"**, không phải "đã được duyệt":

- `PATCH /api/admin/reviews/{id}` với `approved: false` **gỡ** một đánh giá khỏi hồ sơ, `true`
  bật lại. Gỡ chứ không xoá — đáng ngờ nhưng chưa chắc giả thì ẩn đi vẫn lần lại được, và gỡ
  nhầm thì bật lại được. Xoá vĩnh viễn vẫn ở `DELETE /api/reviews/{id}`.
- **Sửa nội dung không ẩn đánh giá đi.** Trước đây có, để chặn mẹo "gửi câu vô hại, chờ duyệt,
  rồi sửa thành thứ khác"; nhưng khi không còn hàng chờ thì ẩn đi là ẩn vĩnh viễn, và người
  sửa một lỗi chính tả sẽ mất luôn đánh giá của mình.
- `avg_rating`/`review_count` chỉ đếm đánh giá **đang hiển thị** — `app/services/rating.py` là
  chỗ duy nhất tính, dùng chung cho cả đường người dùng lẫn đường admin. Lệch nhau thì hồ sơ
  khoe "4.8 sao · 12 đánh giá" trong khi bên dưới đếm được 5.

## Tín hiệu hoạt động

Nỗi lo lớn nhất của học viên khi để lại số điện thoại là **không ai liên hệ lại**. Hồ sơ công
khai trả lời nỗi lo đó bằng dữ liệu thật (`GET /api/pts/{slug}` → `activity`):

| Tín hiệu | Nguồn | Chỉ hiện khi |
|---|---|---|
| `Hoạt động hôm nay / N ngày trước` | `pt_profiles.last_active_at` | Trong vòng 30 ngày (thẻ tìm kiếm: 14 ngày) |
| `Thường phản hồi trong khoảng N giờ` | Trung bình `leads.first_response_at − created_at`, cửa sổ 90 ngày | Có ≥ 3 lead đã phản hồi |
| `N học viên qua PTMatch` | Đếm lead `closed`, toàn thời gian | N > 0 |

Quy tắc chung: **không đủ dữ liệu thì không hiện gì** — hồ sơ mới im lặng còn hơn khoe số 0.

- `last_active_at` cập nhật trong `get_current_pt_profile`, tối đa 1 lần/giờ (`ACTIVITY_REFRESH_INTERVAL`)
  để không tốn một UPDATE cho mỗi request của dashboard.
- `first_response_at` ghi **một lần duy nhất**, khi lead lần đầu rời trạng thái `new`. PT chuyển
  trạng thái qua lại về sau không làm đẹp được số liệu.
- Thời gian phản hồi dùng cửa sổ 90 ngày, còn số học viên tính toàn thời gian — PT từng chăm chỉ
  nhưng nay bỏ bê sẽ mất chỉ số phản hồi, nhưng vẫn giữ thành tích tích luỹ.

Đây cũng là nguyên liệu sẵn có cho PT Ranking (Phase 4) và là bằng chứng khi bán gói lead.

## Phễu liên hệ

Hồ sơ công khai (`GET /api/pts/{slug}`) **không trả `social_links`**. Nếu học viên nhắn thẳng
Zalo/Facebook thì không lead nào được ghi nhận, và không thể chứng minh nền tảng mang lại bao
nhiêu khách cho PT — thứ duy nhất có thể đem đi bán. Chính PT vẫn xem/sửa được qua `GET|PUT
/api/pts/me`. Khi có gói trả phí, cân nhắc mở lại cho PT đã trả tiền (giao diện hiển thị đã sẵn,
tự hiện lại khi API trả về trường này).

`MASK_LEAD_PHONE=true` che SĐT lead khi trả về cho PT (`0912345678` → `091****678`), phục vụ mô
hình mở khoá lead trả phí. **Mặc định tắt** — bật sớm thì PT không liên hệ được ai và không đo
được lead có giá trị hay không.

## SEO

- Trang PT (`/pt/[slug]`) dùng **ISR** (`revalidate = 300`) thay vì render lại mỗi request.
  Vì HTML được cache, lượt xem được đếm từ trình duyệt qua `POST /api/pts/{slug}/view`
  (một lần mỗi phiên) chứ không tính trong lúc SSR.
- `/sitemap.xml` và `/robots.txt` sinh động từ `app/sitemap.ts` / `app/robots.ts`, lấy danh
  sách PT qua `GET /api/pts/sitemap` (chỉ hồ sơ đủ điều kiện hiển thị — xem mục trên).
  Domain lấy từ biến `SITE_URL` (runtime, không cần build lại).
- `app/opengraph-image.tsx` sinh ảnh chia sẻ mặc định 1200×630 bằng `next/og`, phủ cho mọi
  route không tự khai ảnh riêng. Sinh bằng code thay vì file PNG trong repo: sửa chữ chỉ là
  sửa code, và không phải nhét ảnh nhị phân vào git. **Mọi thẻ trong ảnh có nhiều hơn một
  con bắt buộc phải có `display: flex`** — Satori không có block layout và sẽ làm hỏng cả
  bản build chứ không chỉ ảnh này.
- Thẻ `twitter:` do Next tự sinh từ `openGraph`, không cần khai riêng.

## Trang đích cho PT (`/for-trainers`)

Đây là link dán vào bài post trong group Facebook. Trước đây không có trang nào trả lời "vì
sao tôi nên tham gia": PT bấm link từ group rơi vào trang chủ vốn viết cho học viên.

**Nguyên tắc viết, đọc trước khi sửa:** không hứa có sẵn học viên. Chợ đang ở giai đoạn đầu
và PT là phía khó kiếm nhất — hứa "có học viên đang chờ" rồi họ vào thấy trống là mất luôn,
không có lần thứ hai. Thứ bán được ngay hôm nay mà không cần chợ đông là **trang cá nhân**:
link sạch chuẩn SEO, bảng giá, chứng chỉ, ảnh Before/After, đánh giá — thứ một bài post
Facebook trôi mất sau một ngày không giữ được. Bảng "Học viên cần PT" nói như thứ đang lớn
dần, không làm tiêu đề.

Cùng nguyên tắc đó áp cho `description` ở `app/layout.tsx` (theo mọi link chia sẻ đi khắp
nơi), `HomeCTA`, và bước 3 của "Cách hoạt động" trên trang chủ.

## Chia sẻ hồ sơ (`components/ShareProfile.tsx`)

Khi chưa có lưu lượng, người có động cơ mạnh nhất để quảng bá một hồ sơ PT chính là PT đó.
Khối này nằm ở đầu `/dashboard` và làm việc đăng link mất đúng một chạm: chép link, đăng
thẳng lên Facebook, chép sẵn đoạn bài đăng, cộng Web Share API trên mobile (ra được
Zalo/Messenger).

Hiệu ứng kép: học viên cũ của chính PT theo link vào, và họ là nguồn **đánh giá thật** duy
nhất có thể có lúc này — thứ làm hồ sơ đáng tin với người lạ.

Dashboard hiện **một trong hai** ở slot trên cùng, không bao giờ cả hai: hồ sơ chưa đủ điều
kiện → `ListingChecklist` nói còn thiếu gì; hồ sơ đã hiển thị → `ShareProfile`. Origin lấy
từ `window.location.origin` chứ không phải biến build, nếu không PT sẽ copy một link trỏ về
domain khác khi mở site qua staging/IP LAN/tunnel.

## Trang pháp lý

`/privacy` và `/terms` không phải thủ tục cho có: site thu số điện thoại của
người thật rồi chuyển cho bên thứ ba (PT), và bắn sự kiện chuyển đổi về Facebook. Đây là chỗ
bên duyệt quảng cáo tìm đầu tiên khi xét trang đích thu thập thông tin cá nhân.

Mỗi câu trong hai trang đó đối chiếu được với code — ai nhận số (`api/leads.py`), số chỉ lộ
sau khi PT nhận (`api/requests.py`), script đo lường nào được nạp (`components/Analytics.tsx`).
Sửa hành vi thì phải sửa cả trang.

Địa chỉ liên hệ gom ở `lib/contact.ts`, đổi được qua `NEXT_PUBLIC_CONTACT_EMAIL` (nhúng lúc
build). **Hộp thư này phải có thật và có người đọc** trước khi chạy quảng cáo.

## Deploy production (tóm tắt)

1. Tạo GCP project, enable APIs, tạo state bucket — chi tiết trong [infra/README.md](infra/README.md)
2. `cd infra/environments/prod && terragrunt run-all apply`
3. SSH vào GCE, chạy `scripts/setup-server.sh` (Docker, certbot SSL, cron backup)
4. Tạo Cloud Build trigger trên branch `main` → tự động test, build, deploy

## Testing

```bash
docker compose exec backend pytest        # unit + integration test (API)
cd frontend && npm run build              # frontend typecheck + build
cd infra && terraform fmt -recursive -check
```

Test tích hợp tự tạo/xoá database `ptmatch_test` trên cùng Postgres và chạy Alembic lên đó,
nên cần stack dev (hoặc Postgres + Redis) đang chạy.
