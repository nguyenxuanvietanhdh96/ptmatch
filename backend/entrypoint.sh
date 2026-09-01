#!/bin/sh
set -e

# Migration chạy mặc định, nhưng đặt RUN_MIGRATIONS=false để tắt.
#
# Container này chạy dưới `restart: unless-stopped`. Một migration hỏng sẽ làm
# entrypoint thoát, Docker khởi động lại, rồi migration hỏng đó chạy lại vài
# giây một lần lên đúng cái DB đang lỡ dở — vòng lặp vừa vô ích vừa nguy hiểm.
# Tắt cờ này rồi chạy `alembic upgrade head` bằng tay là cách gỡ ra.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  if ! alembic upgrade head; then
    echo "LỖI: migration thất bại." >&2
    echo "Sửa xong thì chạy tay: docker compose exec backend alembic upgrade head" >&2
    echo "Khởi động lại tạm thời không chạy migration: RUN_MIGRATIONS=false" >&2
    exit 1
  fi
else
  echo "Bỏ qua migration (RUN_MIGRATIONS=false)."
fi

# Rate limits key on the client IP. Behind nginx every request arrives from the
# proxy, so without trusting X-Forwarded-For the whole site would share a single
# bucket — one user could lock everyone out of /api/auth/login.
# FORWARDED_ALLOW_IPS chỉ nên mở ("*") khi backend không expose ra ngoài, chỉ
# nginx nội bộ gọi tới (đúng với docker-compose.yml).
# Dựng tham số bằng positional parameters, KHÔNG bằng một chuỗi rồi expand
# không nháy. Ở production FORWARDED_ALLOW_IPS là "*", và `$VAR` không nháy thì
# shell làm HAI việc: tách từ (cần) và khớp đường dẫn (không cần) — dấu * nở
# thành danh sách file trong /app, uvicorn chết ngay lúc khởi động với
#   Error: Got unexpected extra arguments (alembic.ini app entrypoint.sh ...)
# rồi container restart-loop mãi. `"$@"` giữ đúng từng tham số như đã đặt.
set -- --host 0.0.0.0 --port 8000 --proxy-headers \
       --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
if [ "$UVICORN_RELOAD" = "true" ]; then
  set -- "$@" --reload
fi

echo "Starting uvicorn..."
exec uvicorn app.main:app "$@"
