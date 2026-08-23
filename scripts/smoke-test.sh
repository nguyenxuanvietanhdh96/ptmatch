#!/usr/bin/env bash
# Quick API smoke test: auth -> analytics -> lead submission -> notification log.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=${BASE:-http://localhost:8000}

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"pt@ptmatch.vn","password":"password123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "login: ok"

echo "--- analytics (7d) ---"
curl -s "$BASE/api/pts/me/analytics?days=7" -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

SLUG=$(curl -s "$BASE/api/pts?page_size=1" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["slug"])')

echo "--- submit lead to $SLUG ---"
curl -s -X POST "$BASE/api/leads" -H 'Content-Type: application/json' \
  -d "{\"pt_slug\":\"$SLUG\",\"trainee_name\":\"Test HV\",\"trainee_phone\":\"0901234567\",\"goal\":\"Giảm cân\",\"area\":\"Quận 1\",\"budget\":\"3 triệu\"}" \
  | python3 -m json.tool

sleep 2
echo "--- notification log ---"
docker compose logs backend 2>&1 | grep -iE 'notif|smtp' | tail -5
