#!/usr/bin/env bash
# =============================================================================
# fetch-locations.sh — sinh lại danh mục hành chính trong frontend/public/vn-locations/
#
# Usage:  bash scripts/fetch-locations.sh
#
# Nguồn: provinces.open-api.vn, endpoint **v2**.
#
# PHẢI dùng v2, không dùng v1: từ 01/07/2025 Việt Nam còn 34 tỉnh/thành và bỏ
# cấp huyện (tỉnh -> phường/xã trực tiếp). Endpoint v1 — và cả đường tắt
# /api/p/ vốn redirect sang v1 — vẫn trả về cơ cấu 63 tỉnh kèm quận/huyện đã bị
# bãi bỏ. Lấy nhầm bản đó là cả sản phẩm hiển thị đơn vị hành chính không còn
# tồn tại.
#
# Kết quả gồm hai tầng, cố ý:
#   provinces.json      — 34 mục, ~1,3KB, tải ngay khi mở ô chọn
#   wards/<code>.json   — phường/xã của một tỉnh, ~4KB, chỉ tải khi chọn tỉnh đó
# Gộp hết vào một file là bắt mọi người tải 134KB chỉ để thấy danh sách 34 tỉnh.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

API="https://provinces.open-api.vn/api/v2/?depth=2"
OUT_DIR="frontend/public/vn-locations"
TMP="$(mktemp)"
cleanup() { rm -f "${TMP}"; }
trap cleanup EXIT

log() { echo "[fetch-locations] $*"; }

log "Tải danh mục từ ${API} ..."
curl -sSL --fail "${API}" -o "${TMP}"

log "Sinh file vào ${OUT_DIR}/ ..."
OUT_DIR="${OUT_DIR}" SRC="${TMP}" python3 <<'PY'
import json, io, os, shutil

src = os.environ["SRC"]
out_dir = os.environ["OUT_DIR"]

data = sorted(json.load(open(src, encoding="utf-8")), key=lambda p: p["code"])
if len(data) < 30:
    raise SystemExit(
        f"Chỉ nhận được {len(data)} tỉnh — nghi ngờ lấy nhầm endpoint hoặc dữ liệu hỏng."
    )

wards_dir = os.path.join(out_dir, "wards")
shutil.rmtree(wards_dir, ignore_errors=True)
os.makedirs(wards_dir, exist_ok=True)

index = [{"code": p["code"], "name": p["name"]} for p in data]
io.open(os.path.join(out_dir, "provinces.json"), "w", encoding="utf-8").write(
    json.dumps(index, ensure_ascii=False, separators=(",", ":"))
)

total = 0
for p in data:
    wards = [{"code": w["code"], "name": w["name"]} for w in p.get("wards", [])]
    total += len(wards)
    io.open(os.path.join(wards_dir, f"{p['code']}.json"), "w", encoding="utf-8").write(
        json.dumps(wards, ensure_ascii=False, separators=(",", ":"))
    )

print(f"  {len(index)} tỉnh/thành, {total} phường/xã")
PY

log "Xong. Nhớ commit lại ${OUT_DIR}/."
