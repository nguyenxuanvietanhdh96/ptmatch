#!/usr/bin/env bash
# =============================================================================
# require_prod_env — chặn deploy khi .env còn giá trị placeholder.
#
# Vì sao cần file này: docker-compose.yml (base) dùng `${VAR:-default}` chứ
# không `${VAR:?required}`. Không phải lỏng tay — Compose nội suy biến của TỪNG
# FILE trước khi merge, nên một `:?required` trong base sẽ nổ ngay cả khi file
# override định thay giá trị đó, phá luôn đường "clone xong chạy được" của dev.
#
# Bảo đảm chuyển về đây, và mạnh hơn `:?required`: kiểm được cả trường hợp biến
# CÓ giá trị nhưng là placeholder trong .env.example — thứ mà Compose không
# phân biệt được. Cùng nguyên tắc "sai cấu hình phải nổ lúc deploy, không phải
# lúc có người dùng" của app/core/config.py.
#
# Dùng: source file này rồi gọi `require_prod_env` (cwd = APP_DIR).
# =============================================================================

# Đọc một biến từ .env. Lấy dòng CUỐI (trùng key thì dòng sau thắng, giống cách
# docker/dotenv đọc) và bỏ nháy bao ngoài nếu có.
_env_value() {
  local key="$1" raw
  raw="$(grep -E "^${key}=" .env 2>/dev/null | tail -n1 | cut -d= -f2-)" || true
  raw="${raw%\"}"; raw="${raw#\"}"
  raw="${raw%\'}"; raw="${raw#\'}"
  printf '%s' "${raw}"
}

require_prod_env() {
  local errors=0
  _fail() { echo "  ✗ $*" >&2; errors=$((errors + 1)); }

  if [[ ! -f .env ]]; then
    echo "Thiếu $(pwd)/.env — chạy scripts/setup-server.sh trước." >&2
    return 1
  fi

  local pg secret site
  pg="$(_env_value POSTGRES_PASSWORD)"
  secret="$(_env_value SECRET_KEY)"
  site="$(_env_value SITE_URL)"

  # Mật khẩu DB: base compose mặc định về `ptmatch_secret` để dev chạy được;
  # để nguyên giá trị đó ở production nghĩa là ai đọc repo cũng biết mật khẩu.
  [[ -n "${pg}" ]]                 || _fail "POSTGRES_PASSWORD trống trong .env"
  [[ "${pg}" != "ptmatch_secret" ]] || _fail "POSTGRES_PASSWORD còn là placeholder dev 'ptmatch_secret' (sinh mới: openssl rand -hex 24)"

  # Trùng danh sách INSECURE_SECRET_KEYS + MIN_SECRET_KEY_LENGTH trong
  # app/core/config.py. Backend cũng tự từ chối boot, nhưng bắt ở đây thì lỗi
  # hiện ra trước khi container nào được tạo.
  [[ -n "${secret}" ]] || _fail "SECRET_KEY trống trong .env"
  case "${secret}" in
    dev-secret-change-me|change-me-to-a-long-random-string)
      _fail "SECRET_KEY còn là placeholder (sinh mới: openssl rand -hex 32)" ;;
  esac
  if [[ -n "${secret}" && ${#secret} -lt 32 ]]; then
    _fail "SECRET_KEY chỉ ${#secret} ký tự, cần tối thiểu 32"
  fi

  # SITE_URL đi vào sitemap.xml và robots.txt. Trỏ localhost ở production thì
  # Google nhận một sitemap toàn link không truy cập được.
  [[ -n "${site}" ]] || _fail "SITE_URL trống trong .env"
  case "${site}" in
    *localhost*|*127.0.0.1*)
      _fail "SITE_URL đang là '${site}' — production phải là https://<domain> (nó vào sitemap.xml/robots.txt)" ;;
  esac

  if (( errors > 0 )); then
    echo "" >&2
    echo "==> ${errors} giá trị trong $(pwd)/.env chưa dùng được cho production." >&2
    echo "    Sửa rồi chạy lại. Bỏ qua kiểm tra này (KHÔNG khuyến khích): SKIP_ENV_CHECK=1" >&2
    return 1
  fi
  return 0
}
