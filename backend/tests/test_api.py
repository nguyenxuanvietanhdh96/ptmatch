"""End-to-end API tests covering auth, upload authorisation, reviews and search.

Each test registers its own users with a unique email, so the suite does not
depend on ordering or on seed data.
"""
import uuid
from unittest.mock import patch
from urllib.parse import urlsplit

import pytest

from app.core.ratelimit import limiter

pytestmark = pytest.mark.asyncio


async def register(client, role: str, name: str = "Nguyen Van A") -> dict:
    email = f"{role}-{uuid.uuid4().hex[:12]}@example.com"
    response = await client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "password123",
            "role": role,
            "full_name": name,
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    data["email"] = email
    return data


def auth_header(tokens: dict) -> dict:
    return {"Authorization": "Bearer %s" % tokens["access_token"]}


async def register_admin(client) -> dict:
    """Admin không đăng ký được qua API (schema chỉ nhận pt/trainee), nên nâng
    quyền trực tiếp trong DB — đúng như cách nó xảy ra thật."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from tests.conftest import TEST_DATABASE_URL

    tokens = await register(client, "trainee", "Nguoi Quan Tri")
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = 'admin' WHERE email = :email"),
            {"email": tokens["email"]},
        )
    await engine.dispose()
    return tokens


async def pt_slug(client, tokens: dict) -> str:
    response = await client.get("/api/pts/me", headers=auth_header(tokens))
    assert response.status_code == 200, response.text
    return response.json()["slug"]


async def make_listable(client, tokens: dict) -> str:
    """Bổ sung đủ điều kiện để hồ sơ được bày ra /pts và sitemap.

    Đăng ký xong hồ sơ vẫn còn rỗng, và hồ sơ rỗng cố ý KHÔNG xuất hiện ở chỗ
    công khai (xem app/services/listing.py). Test nào cần thấy hồ sơ trong danh
    sách thì phải đi qua đây, đúng như một PT thật phải làm.
    """
    saved = await client.put(
        "/api/pts/me",
        headers=auth_header(tokens),
        json={
            "avatar_url": "https://images.unsplash.com/photo-1.jpg",
            "pricing": {"per_session": 400000},
        },
    )
    assert saved.status_code == 200, saved.text
    location = await client.post(
        "/api/pts/me/locations",
        headers=auth_header(tokens),
        json={"gym_name": "California Fitness", "ward": "Ben Nghe", "city": "TP. Hồ Chí Minh"},
    )
    assert location.status_code in (200, 201), location.text
    return saved.json()["slug"]


async def set_review_visible(client, review_id: str, visible: bool = True) -> None:
    """Bật/tắt hiển thị một đánh giá (quyền admin).

    Đánh giá gửi lên hiện ngay, nên helper này chỉ dùng cho test về việc GỠ
    xuống rồi bật lại.
    """
    headers = await _admin_header(client)
    response = await client.patch(
        f"/api/admin/reviews/{review_id}",
        headers=headers,
        json={"approved": visible},
    )
    assert response.status_code == 200, response.text


# ---------------------------------------------------------------------------
# Auth: refresh rotation + logout
# ---------------------------------------------------------------------------

async def test_refresh_rotates_and_old_token_is_rejected(client):
    tokens = await register(client, "trainee")

    first = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert first.status_code == 200, first.text
    rotated = first.json()["refresh_token"]

    replayed = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert replayed.status_code == 401, replayed.text

    assert rotated != tokens["refresh_token"]
    still_valid = await client.post("/api/auth/refresh", json={"refresh_token": rotated})
    assert still_valid.status_code == 200, still_valid.text


async def test_logout_revokes_refresh_token(client):
    tokens = await register(client, "trainee")

    logout = await client.post(
        "/api/auth/logout", json={"refresh_token": tokens["refresh_token"]}
    )
    assert logout.status_code == 204

    after = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert after.status_code == 401


async def test_logout_with_garbage_token_is_a_noop(client):
    response = await client.post("/api/auth/logout", json={"refresh_token": "not-a-jwt"})
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# Upload authorisation
# ---------------------------------------------------------------------------

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 32


async def presign(client, tokens: dict) -> dict:
    response = await client.post(
        "/api/upload/presign",
        headers=auth_header(tokens),
        json={"filename": "photo.png", "content_type": "image/png"},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_local_upload_rejects_anonymous_writes(client):
    tokens = await register(client, "pt")
    upload_path = urlsplit((await presign(client, tokens))["upload_url"]).path

    response = await client.put(
        upload_path, content=PNG_BYTES, headers={"Content-Type": "image/png"}
    )
    assert response.status_code == 401


async def test_local_upload_rejects_other_users_prefix(client):
    owner = await register(client, "pt")
    intruder = await register(client, "pt")
    upload_path = urlsplit((await presign(client, owner))["upload_url"]).path

    response = await client.put(
        upload_path,
        content=PNG_BYTES,
        headers={**auth_header(intruder), "Content-Type": "image/png"},
    )
    assert response.status_code == 403


async def test_local_upload_accepts_own_prefix(client):
    owner = await register(client, "pt")
    signed = await presign(client, owner)
    assert signed["requires_auth"] is True

    response = await client.put(
        urlsplit(signed["upload_url"]).path,
        content=PNG_BYTES,
        headers={**auth_header(owner), "Content-Type": "image/png"},
    )
    assert response.status_code == 200
    assert response.json()["public_url"].endswith(urlsplit(signed["public_url"]).path)


async def test_upload_presign_rejects_non_media(client):
    tokens = await register(client, "pt")
    response = await client.post(
        "/api/upload/presign",
        headers=auth_header(tokens),
        json={"filename": "payload.html", "content_type": "text/html"},
    )
    assert response.status_code == 415


async def test_upload_presign_rejects_svg(client):
    # SVG can carry <script> and is served same-origin under /media in
    # STORAGE_BACKEND=local — must be rejected like any other non-raster type.
    tokens = await register(client, "pt")
    response = await client.post(
        "/api/upload/presign",
        headers=auth_header(tokens),
        json={"filename": "payload.svg", "content_type": "image/svg+xml"},
    )
    assert response.status_code == 415


async def test_local_upload_rejects_content_type_extension_mismatch(client):
    # Presign issues a key ending in .png; PUTting a different (still
    # allowed) content-type against that same key must be rejected, or a
    # client could pick the extension and lie about the type on write.
    owner = await register(client, "pt")
    signed = await presign(client, owner)

    response = await client.put(
        urlsplit(signed["upload_url"]).path,
        content=PNG_BYTES,
        headers={**auth_header(owner), "Content-Type": "image/jpeg"},
    )
    assert response.status_code == 400


async def test_local_upload_rejects_direct_put_with_disallowed_extension(client):
    # The write path (not just /presign) must independently refuse a
    # client-constructed key whose extension isn't in the allowed map, even
    # under the caller's own prefix and with an otherwise-allowed header.
    owner = await register(client, "pt")

    response = await client.put(
        "/api/upload/local/uploads/%s/evil.html" % owner["user"]["id"],
        content=b"<script>alert(1)</script>",
        headers={**auth_header(owner), "Content-Type": "image/png"},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------

async def test_pt_cannot_review_own_profile(client):
    pt = await register(client, "pt", "Tran Van Pt")
    slug = await pt_slug(client, pt)

    response = await client.post(
        f"/api/pts/{slug}/reviews",
        headers=auth_header(pt),
        json={"reviewer_name": "Tran Van Pt", "rating": 5},
    )
    assert response.status_code == 400


async def test_trainee_cannot_review_same_pt_twice(client):
    pt = await register(client, "pt", "Le Thi Pt")
    trainee = await register(client, "trainee")
    slug = await pt_slug(client, pt)

    first = await client.post(
        f"/api/pts/{slug}/reviews",
        headers=auth_header(trainee),
        json={"reviewer_name": "Hoc vien", "rating": 5, "content": "Rat tot"},
    )
    assert first.status_code == 201

    second = await client.post(
        f"/api/pts/{slug}/reviews",
        headers=auth_header(trainee),
        json={"reviewer_name": "Hoc vien", "rating": 1, "content": "Spam"},
    )
    assert second.status_code == 409


async def test_anonymous_review_requires_a_phone(client):
    """SĐT là thứ duy nhất phân biệt được người gửi ẩn danh.

    Không có nó thì uq_reviews_pt_anon_phone không ràng buộc được gì, và PT chỉ
    cần đăng xuất là tự bấm 5 sao cho mình không giới hạn.
    """
    pt = await register(client, "pt", "Vo Van Pt")
    slug = await pt_slug(client, pt)

    response = await client.post(
        f"/api/pts/{slug}/reviews",
        json={"reviewer_name": "Nguoi la", "rating": 5},
    )
    assert response.status_code == 400


async def test_anonymous_cannot_review_same_pt_twice_with_one_phone(client):
    """Chặn thổi điểm bằng cách đăng xuất rồi gửi đi gửi lại.

    Trước đây mọi kiểm tra trùng lặp chỉ chạy khi có đăng nhập, nên đường ẩn
    danh hoàn toàn không bị ràng buộc.
    """
    pt = await register(client, "pt", "Bui Thi Pt")
    slug = await pt_slug(client, pt)
    payload = {"reviewer_name": "Nguoi la", "reviewer_phone": "0901234567", "rating": 5}

    first = await client.post(f"/api/pts/{slug}/reviews", json=payload)
    assert first.status_code == 201

    second = await client.post(
        f"/api/pts/{slug}/reviews",
        json={**payload, "rating": 5, "content": "Bom diem"},
    )
    assert second.status_code == 409

    profile = (await client.get(f"/api/pts/{slug}")).json()
    assert profile["review_count"] == 1


async def test_same_phone_can_review_different_pts(client):
    """Ràng buộc chống trùng phải theo từng PT, không khoá người dùng lại một lần."""
    slug_a = await pt_slug(client, await register(client, "pt", "Pt Mot"))
    slug_b = await pt_slug(client, await register(client, "pt", "Pt Hai"))
    payload = {"reviewer_name": "Nguoi la", "reviewer_phone": "0907654321", "rating": 4}

    assert (await client.post(f"/api/pts/{slug_a}/reviews", json=payload)).status_code == 201
    assert (await client.post(f"/api/pts/{slug_b}/reviews", json=payload)).status_code == 201


async def test_rating_aggregate_tracks_reviews(client):
    pt = await register(client, "pt", "Pham Van Pt")
    slug = await pt_slug(client, pt)

    for seen_so_far, rating in enumerate((5, 4)):
        trainee = await register(client, "trainee")
        response = await client.post(
            f"/api/pts/{slug}/reviews",
            headers=auth_header(trainee),
            json={"reviewer_name": "Hoc vien", "rating": rating},
        )
        assert response.status_code == 201
        # Tính vào điểm ngay, không qua hàng chờ.
        counted = (await client.get(f"/api/pts/{slug}")).json()
        assert counted["review_count"] == seen_so_far + 1

    profile = (await client.get(f"/api/pts/{slug}")).json()
    assert profile["review_count"] == 2
    assert profile["avg_rating"] == pytest.approx(4.5)


async def test_deleting_a_review_updates_the_aggregate(client):
    pt = await register(client, "pt", "Do Van Pt")
    trainee = await register(client, "trainee")
    slug = await pt_slug(client, pt)

    created = await client.post(
        f"/api/pts/{slug}/reviews",
        headers=auth_header(trainee),
        json={"reviewer_name": "Hoc vien", "rating": 3},
    )
    review_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/reviews/{review_id}", headers=auth_header(trainee)
    )
    assert deleted.status_code == 204, deleted.text

    profile = (await client.get(f"/api/pts/{slug}")).json()
    assert profile["review_count"] == 0
    assert profile["avg_rating"] == 0


# ---------------------------------------------------------------------------
# Search / profile
# ---------------------------------------------------------------------------

async def test_search_survives_non_numeric_pricing(client, raw_sql):
    """`pricing` là JSONB tự do: một giá trị không phải số không được làm đổ cả
    trang tìm kiếm.

    Hồ sơ đó cũng không được xuất hiện trong danh sách — thẻ PT lấy giá theo
    buổi làm thông tin chính, mà ở đây không có giá dùng được. Nhưng trang hồ sơ
    truy cập thẳng vẫn phải mở được: link đã chia sẻ thì không được gãy.
    """
    pt = await register(client, "pt", "Bui Van Gia")
    slug = await make_listable(client, pt)
    await raw_sql(
        "UPDATE pt_profiles SET pricing = jsonb_build_object('per_session', 'thoa thuan')"
        " WHERE slug = :slug",
        slug=slug,
    )

    listing = await client.get("/api/pts", params={"sort": "price"})
    assert listing.status_code == 200
    assert all(item["slug"] != slug for item in listing.json()["items"])

    filtered = await client.get(
        "/api/pts", params={"price_min": 100000, "price_max": 900000}
    )
    assert filtered.status_code == 200
    assert all(item["slug"] != slug for item in filtered.json()["items"])

    detail = await client.get(f"/api/pts/{slug}")
    assert detail.status_code == 200
    assert detail.json()["pricing"]["per_session"] is None


async def test_public_profile_hides_social_links(client):
    pt = await register(client, "pt", "Ho Van Social")
    slug = await pt_slug(client, pt)
    saved = await client.put(
        "/api/pts/me",
        headers=auth_header(pt),
        json={"social_links": {"zalo": "0900000000", "facebook": "fb.com/pt"}},
    )
    assert saved.status_code == 200

    # Chủ hồ sơ vẫn thấy để chỉnh sửa — và giá trị đã được chuẩn hoá thành URL
    # dùng được: số Zalo thành link zalo.me, tên miền trần được thêm https://.
    # Lưu nguyên xi thì React render thành href tương đối và ra link chết.
    assert saved.json()["social_links"]["zalo"] == "https://zalo.me/0900000000"
    mine = await client.get("/api/pts/me", headers=auth_header(pt))
    assert mine.json()["social_links"]["facebook"] == "https://fb.com/pt"

    # ...nhưng hồ sơ công khai thì không, để form liên hệ là đường duy nhất.
    public = await client.get(f"/api/pts/{slug}")
    assert public.status_code == 200
    assert "social_links" not in public.json()


async def test_lead_phone_masking_toggle(client, monkeypatch):
    from app.core.config import settings

    pt = await register(client, "pt", "Ly Van Lead")
    slug = await pt_slug(client, pt)
    sent = await client.post(
        "/api/leads",
        json={
            "pt_slug": slug,
            "trainee_name": "Hoc vien",
            "trainee_phone": "0912345678",
        },
    )
    assert sent.status_code == 201
    # Người gửi luôn thấy đủ số của chính mình.
    assert sent.json()["trainee_phone"] == "0912345678"

    unmasked = await client.get("/api/leads", headers=auth_header(pt))
    assert unmasked.status_code == 200, unmasked.text
    assert unmasked.json()[0]["trainee_phone"] == "0912345678"

    monkeypatch.setattr(settings, "mask_lead_phone", True)
    masked = await client.get("/api/leads", headers=auth_header(pt))
    assert masked.status_code == 200, masked.text
    assert masked.json()[0]["trainee_phone"] == "091****678"


# ---------------------------------------------------------------------------
# Tín hiệu hoạt động
# ---------------------------------------------------------------------------

async def send_lead(client, slug: str, name: str = "Hoc vien") -> str:
    response = await client.post(
        "/api/leads",
        json={"pt_slug": slug, "trainee_name": name, "trainee_phone": "0912345678"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def set_lead_status(client, pt: dict, lead_id: str, status: str):
    return await client.patch(
        f"/api/leads/{lead_id}/status", headers=auth_header(pt), json={"status": status}
    )


async def test_first_response_is_recorded_once(client, raw_sql):
    pt = await register(client, "pt", "Ha Van Reply")
    slug = await pt_slug(client, pt)
    lead_id = await send_lead(client, slug)

    async def stored_response_at():
        rows = await raw_sql(
            "SELECT first_response_at FROM leads WHERE id = :id", id=lead_id
        )
        return rows[0][0]

    assert await stored_response_at() is None

    assert (await set_lead_status(client, pt, lead_id, "contacted")).status_code == 200
    first = await stored_response_at()
    assert first is not None

    # Đổi trạng thái thêm lần nữa không được dời mốc phản hồi đầu tiên.
    assert (await set_lead_status(client, pt, lead_id, "closed")).status_code == 200
    assert await stored_response_at() == first


async def test_activity_needs_enough_leads_before_showing_response_time(client):
    pt = await register(client, "pt", "Mai Van Active")
    slug = await pt_slug(client, pt)

    for _ in range(2):
        await set_lead_status(client, pt, await send_lead(client, slug), "contacted")

    activity = (await client.get(f"/api/pts/{slug}")).json()["activity"]
    assert activity["response_hours"] is None, "2 lead thì chưa đủ để công bố"

    await set_lead_status(client, pt, await send_lead(client, slug), "contacted")
    activity = (await client.get(f"/api/pts/{slug}")).json()["activity"]
    assert activity["response_hours"] is not None
    assert activity["response_hours"] >= 0


async def test_activity_counts_only_closed_leads_as_students(client):
    pt = await register(client, "pt", "Cao Van Close")
    slug = await pt_slug(client, pt)

    await set_lead_status(client, pt, await send_lead(client, slug), "closed")
    await set_lead_status(client, pt, await send_lead(client, slug), "lost")
    await send_lead(client, slug)  # vẫn ở trạng thái 'new'

    activity = (await client.get(f"/api/pts/{slug}")).json()["activity"]
    assert activity["students_coached"] == 1


async def test_dashboard_access_marks_pt_as_active(client):
    pt = await register(client, "pt", "Trinh Van Online")
    # pt_slug() gọi /api/pts/me, tức là đã "vào dashboard".
    slug = await pt_slug(client, pt)

    public = (await client.get(f"/api/pts/{slug}")).json()
    assert public["activity"]["last_active_at"] is not None
    assert public["last_active_at"] is not None


async def test_view_counter_endpoint(client):
    pt = await register(client, "pt", "Vu Van Xem")
    slug = await pt_slug(client, pt)

    before = (await client.get("/api/pts/me", headers=auth_header(pt))).json()["view_count"]
    assert (await client.post(f"/api/pts/{slug}/view")).status_code == 204
    after = (await client.get("/api/pts/me", headers=auth_header(pt))).json()["view_count"]

    assert after == before + 1
    # A plain profile read must not count as a view — the page is cached.
    await client.get(f"/api/pts/{slug}")
    unchanged = (await client.get("/api/pts/me", headers=auth_header(pt))).json()["view_count"]
    assert unchanged == after


async def test_view_counter_unknown_slug_is_404(client):
    assert (await client.post("/api/pts/khong-ton-tai/view")).status_code == 404


async def test_sitemap_lists_active_profiles(client, raw_sql):
    pt = await register(client, "pt", "Ngo Van Sitemap")
    slug = await pt_slug(client, pt)

    # Hồ sơ vừa đăng ký còn rỗng: không đưa vào sitemap, vì đó là lời mời Google
    # lập chỉ mục một trang không có gì để đọc.
    entries = (await client.get("/api/pts/sitemap")).json()
    assert all(entry["slug"] != slug for entry in entries)

    await make_listable(client, pt)
    entries = (await client.get("/api/pts/sitemap")).json()
    assert any(entry["slug"] == slug for entry in entries)

    await raw_sql("UPDATE pt_profiles SET is_active = false WHERE slug = :slug", slug=slug)
    entries = (await client.get("/api/pts/sitemap")).json()
    assert all(entry["slug"] != slug for entry in entries)


# ---------------------------------------------------------------------------
# Rate limiting (the only test that runs with the limiter switched on)
# ---------------------------------------------------------------------------

async def test_rate_limit_blocks_login_flood(client):
    limiter.enabled = True
    try:
        statuses = []
        for _ in range(15):
            response = await client.post(
                "/api/auth/login",
                json={"email": "nobody@example.com", "password": "wrong-password"},
            )
            statuses.append(response.status_code)
    finally:
        limiter.enabled = False

    assert 429 in statuses, "brute-forcing /api/auth/login should be rate limited"


# ---------------------------------------------------------------------------
# Bảng "Học viên cần PT"
# ---------------------------------------------------------------------------

async def post_request(client, tokens: dict | None = None, **overrides) -> dict:
    body = {
        "trainee_name": "Le Van Hoc",
        "trainee_phone": "0912345678",
        "specialty": "weight_loss",
        "city": "Thành phố Hồ Chí Minh",
        "ward": "Phường Tân Thuận",
        "budget_min": 300000,
        "budget_max": 500000,
    }
    body.update(overrides)
    headers = auth_header(tokens) if tokens else {}
    response = await client.post("/api/requests", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_request_board_never_exposes_phone(client):
    created = await post_request(client)
    assert "trainee_phone" not in created

    listing = await client.get("/api/requests")
    assert listing.status_code == 200
    item = next(i for i in listing.json()["items"] if i["id"] == created["id"])
    assert "trainee_phone" not in item

    detail = await client.get(f"/api/requests/{created['id']}")
    assert "trainee_phone" not in detail.json()


async def test_contact_other_is_as_private_as_the_phone(client):
    """Kênh liên hệ phụ phải kín y hệt số điện thoại, nếu không thì mất luôn
    ranh giới thu phí: PT xem bảng là nhắn Facebook thẳng, khỏi cần nhận."""
    created = await post_request(client, contact_other="fb.com/hocvien")
    assert "contact_other" not in created

    listing = await client.get("/api/requests")
    item = next(i for i in listing.json()["items"] if i["id"] == created["id"])
    assert "contact_other" not in item
    assert "fb.com/hocvien" not in listing.text

    detail = await client.get(f"/api/requests/{created['id']}")
    assert "fb.com/hocvien" not in detail.text

    # Nhưng PT đã nhận thì phải thấy, nếu không thì lưu làm gì.
    pt = await register(client, "pt", "PT Xem Facebook")
    await client.post(f"/api/requests/{created['id']}/claim", headers=auth_header(pt))
    leads = (await client.get("/api/leads", headers=auth_header(pt))).json()
    assert "fb.com/hocvien" in leads[0]["goal"]


async def test_claiming_creates_a_lead_with_the_phone(client):
    pt = await register(client, "pt", "Nhan Van Yeucau")
    created = await post_request(client)

    claim = await client.post(
        f"/api/requests/{created['id']}/claim", headers=auth_header(pt)
    )
    assert claim.status_code == 200, claim.text
    assert claim.json()["claim_count"] == 1

    leads = (await client.get("/api/leads", headers=auth_header(pt))).json()
    assert len(leads) == 1
    assert leads[0]["trainee_phone"] == "0912345678"
    # Nội dung lead được dựng từ yêu cầu, đủ để PT gọi ngay.
    assert "Giảm cân" in leads[0]["goal"]
    assert leads[0]["area"] == "Phường Tân Thuận, Thành phố Hồ Chí Minh"
    assert leads[0]["budget"] == "300.000đ - 500.000đ/buổi"


async def test_pt_cannot_claim_twice(client):
    pt = await register(client, "pt", "Hai Lan Nhan")
    created = await post_request(client)

    first = await client.post(f"/api/requests/{created['id']}/claim", headers=auth_header(pt))
    assert first.status_code == 200
    second = await client.post(f"/api/requests/{created['id']}/claim", headers=auth_header(pt))
    assert second.status_code == 409


async def test_no_claim_limit_and_request_stays_on_the_board(client):
    """Không còn trần suất — yêu cầu chỉ rời bảng khi học viên đóng hoặc hết hạn.

    Trần cũ chặn theo số lần bấm nhận, nhưng bấm nhận chỉ là lấy số điện thoại.
    Đủ trần thì yêu cầu biến mất dù chưa PT nào gọi: học viên chờ vô ích, PT đến
    sau không thấy nó nữa. Test này khoá lại hành vi mới.
    """
    created = await post_request(client)

    for taken in range(1, 6):
        pt = await register(client, "pt", "PT Nhan %d" % taken)
        claim = await client.post(
            f"/api/requests/{created['id']}/claim", headers=auth_header(pt)
        )
        assert claim.status_code == 200, claim.text
        assert claim.json()["claim_count"] == taken
        assert "slots_left" not in claim.json()

    # Vẫn nằm trên bảng sau 5 PT nhận, và PT thứ 6 vẫn nhận được.
    listing = await client.get("/api/requests")
    assert any(i["id"] == created["id"] for i in listing.json()["items"])
    late = await register(client, "pt", "PT Den Muon")
    accepted = await client.post(
        f"/api/requests/{created['id']}/claim", headers=auth_header(late)
    )
    assert accepted.status_code == 200, accepted.text

    # Chỉ học viên đóng thì nó mới rời bảng.
    owner = await register(client, "trainee", "Chu Yeu Cau")
    mine = await post_request(client, owner)
    await client.patch(
        f"/api/requests/{mine['id']}/close",
        json={"reason": "found_pt"},
        headers=auth_header(owner),
    )
    listing = await client.get("/api/requests")
    assert all(i["id"] != mine["id"] for i in listing.json()["items"])


async def test_funnel_separates_claiming_from_actually_contacting(client):
    """Số liệu phải phân biệt "PT bấm nhận" với "PT thật sự liên hệ".

    Gộp hai bước đó thì tiêu chí dừng của giai đoạn kiểm chứng đo nhầm số: bảng
    đầy yêu cầu "đã có PT nhận" nhưng chưa ai tập với ai.
    """
    admin = await register_admin(client)
    # Đo theo mức tăng: DB test dùng chung, các test khác cũng đăng yêu cầu.
    before = (await client.get("/api/requests/stats", headers=auth_header(admin))).json()

    # Yêu cầu 1: có PT nhận nhưng PT im luôn.
    ghosted = await post_request(client)
    lazy = await register(client, "pt", "PT Nhan Roi Im")
    await client.post(f"/api/requests/{ghosted['id']}/claim", headers=auth_header(lazy))

    # Yêu cầu 2: PT nhận, gọi, rồi chốt được.
    won = await post_request(client)
    good = await register(client, "pt", "PT Goi Va Chot")
    claim = await client.post(
        f"/api/requests/{won['id']}/claim", headers=auth_header(good)
    )
    lead_id = claim.json()["lead_id"]
    moved = await client.patch(
        f"/api/leads/{lead_id}/status",
        json={"status": "closed"},
        headers=auth_header(good),
    )
    assert moved.status_code == 200, moved.text

    # Yêu cầu 3: không ai nhận.
    await post_request(client)

    stats = await client.get("/api/requests/stats", headers=auth_header(admin))
    assert stats.status_code == 200, stats.text
    data = stats.json()

    def grew(key: str) -> int:
        return data[key] - before[key]

    assert grew("requests_posted") == 3
    assert grew("requests_claimed") == 2
    # Chỉ yêu cầu số 2 có PT thật sự động tới — đây là cả lý do endpoint tồn tại.
    assert grew("requests_contacted") == 1
    assert grew("requests_won") == 1
    assert grew("claims_total") == 2


async def test_funnel_is_admin_only(client):
    """Số liệu vận hành lộ ra là PT biết chợ đang vắng tới mức nào."""
    anon = await client.get("/api/requests/stats")
    assert anon.status_code in (401, 403)

    pt = await register(client, "pt", "PT To Mo")
    assert (
        await client.get("/api/requests/stats", headers=auth_header(pt))
    ).status_code == 403

    trainee = await register(client, "trainee", "Hoc Vien To Mo")
    assert (
        await client.get("/api/requests/stats", headers=auth_header(trainee))
    ).status_code == 403


async def test_trainee_only_endpoints(client):
    trainee = await register(client, "trainee")
    created = await post_request(client, trainee)

    mine = await client.get("/api/requests/mine", headers=auth_header(trainee))
    assert mine.status_code == 200
    assert [r["id"] for r in mine.json()] == [created["id"]]
    assert mine.json()[0]["claimed_by"] == []

    pt = await register(client, "pt", "Xuat Hien Trong Mine")
    await client.post(f"/api/requests/{created['id']}/claim", headers=auth_header(pt))
    mine = (await client.get("/api/requests/mine", headers=auth_header(trainee))).json()
    assert len(mine[0]["claimed_by"]) == 1
    assert mine[0]["claimed_by"][0]["full_name"] == "Xuat Hien Trong Mine"

    closed = await client.patch(
        f"/api/requests/{created['id']}/close",
        json={"reason": "found_pt"},
        headers=auth_header(trainee),
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert closed.json()["close_reason"] == "found_pt"

    # Đóng rồi thì PT khác không nhận được nữa.
    other = await register(client, "pt", "Nhan Sau Khi Dong")
    rejected = await client.post(
        f"/api/requests/{created['id']}/claim", headers=auth_header(other)
    )
    assert rejected.status_code == 409


async def test_close_reason_is_required_and_lands_in_the_funnel(client):
    """Lý do đóng là số liệu chuyển đổi duy nhất do chính học viên khai.

    Trạng thái lead do PT tự khai: PT quên chuyển cột thì requests_won = 0 dù đã
    có người tập. Nên đóng mà không kèm lý do phải bị từ chối, không âm thầm
    ghi nhận.
    """
    admin = await register_admin(client)
    before = (await client.get("/api/requests/stats", headers=auth_header(admin))).json()

    owner = await register(client, "trainee", "Nguoi Dong Yeu Cau")

    # Không có lý do -> 422, chứ không phải đóng lặng lẽ.
    bare = await post_request(client, owner)
    no_reason = await client.patch(
        f"/api/requests/{bare['id']}/close", headers=auth_header(owner)
    )
    assert no_reason.status_code == 422, no_reason.text
    # Lý do lạ cũng vậy — tránh rác trong cột dùng để đếm.
    bad = await client.patch(
        f"/api/requests/{bare['id']}/close",
        json={"reason": "chan_qua"},
        headers=auth_header(owner),
    )
    assert bad.status_code == 422

    for reason in ("found_pt", "no_longer_needed"):
        created = await post_request(client, owner)
        closed = await client.patch(
            f"/api/requests/{created['id']}/close",
            json={"reason": reason},
            headers=auth_header(owner),
        )
        assert closed.status_code == 200, closed.text
        assert closed.json()["close_reason"] == reason

    # Lý do không lộ ra bảng công khai — PT không cần biết vì sao ai đó đóng.
    listing = await client.get("/api/requests?include_closed=true")
    assert "close_reason" not in listing.json()["items"][0]

    stats = (await client.get("/api/requests/stats", headers=auth_header(admin))).json()
    assert stats["closed_found_pt"] - before["closed_found_pt"] == 1
    assert stats["closed_no_longer_needed"] - before["closed_no_longer_needed"] == 1


async def test_trainee_cannot_close_someone_elses_request(client):
    owner = await register(client, "trainee")
    stranger = await register(client, "trainee")
    created = await post_request(client, owner)

    response = await client.patch(
        f"/api/requests/{created['id']}/close",
        json={"reason": "found_pt"},
        headers=auth_header(stranger),
    )
    assert response.status_code == 404


async def test_board_filters(client):
    await post_request(
        client, specialty="rehab", ward="Phường Sài Gòn", budget_min=200000, budget_max=250000
    )
    target = await post_request(
        client, specialty="bodybuilding", ward="Phường Bàn Cờ", budget_max=900000
    )

    by_specialty = await client.get("/api/requests", params={"specialty": "bodybuilding"})
    assert all(i["specialty"] == "bodybuilding" for i in by_specialty.json()["items"])

    by_ward = await client.get("/api/requests", params={"ward": "Phường Bàn Cờ"})
    assert any(i["id"] == target["id"] for i in by_ward.json()["items"])

    # Lọc khu vực bỏ dấu và khớp một phần, giống /api/pts. Trước đây chỗ này so
    # sánh bằng tuyệt đối nên người gõ "ban co" không thấy gì.
    loose = await client.get("/api/requests", params={"ward": "ban co"})
    assert any(i["id"] == target["id"] for i in loose.json()["items"])

    # PT lấy 800k/buổi chỉ thấy yêu cầu kham nổi mức đó.
    by_budget = await client.get("/api/requests", params={"budget_min": 800000})
    ids = [i["id"] for i in by_budget.json()["items"]]
    assert target["id"] in ids


async def test_gender_filter_keeps_unspecified_requests(client):
    wants_female = await post_request(client, preferred_gender="female")
    no_preference = await post_request(client, preferred_gender=None)

    listing = await client.get("/api/requests", params={"gender": "male"})
    ids = [i["id"] for i in listing.json()["items"]]
    assert no_preference["id"] in ids, "yêu cầu không nêu giới tính phải hiện cho mọi PT"
    assert wants_female["id"] not in ids


async def test_claim_requires_pt_role(client):
    trainee = await register(client, "trainee")
    created = await post_request(client)
    response = await client.post(
        f"/api/requests/{created['id']}/claim", headers=auth_header(trainee)
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# OAuth — đổi mã một lần lấy token
# ---------------------------------------------------------------------------

async def _oauth_code_for(user_id: str) -> str:
    """Đặt sẵn một mã đổi token vào Redis, y như callback OAuth vẫn làm."""
    import json

    from app.api.auth import _OAUTH_EXCHANGE_TTL
    from app.core.redis import get_redis

    code = uuid.uuid4().hex + uuid.uuid4().hex
    await get_redis().set(
        f"oauth_exchange:{code}",
        json.dumps({"user_id": user_id}),
        ex=_OAUTH_EXCHANGE_TTL,
    )
    return code


async def test_oauth_exchange_returns_tokens_and_burns_the_code(client):
    """Mã chỉ dùng được một lần.

    Đây là lý do tồn tại của cả cơ chế này: mã đi qua URL nên nó đọng lại trong
    lịch sử trình duyệt và access log; dùng lại được lần hai thì việc bỏ token
    ra khỏi URL cũng vô nghĩa.
    """
    tokens = await register(client, "trainee", "Nguoi Dung OAuth")
    me = (await client.get("/api/auth/me", headers=auth_header(tokens))).json()

    code = await _oauth_code_for(me["id"])

    first = await client.post("/api/auth/oauth/exchange", json={"code": code})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["id"] == me["id"]

    # Token nhận được phải dùng được thật.
    whoami = await client.get(
        "/api/auth/me", headers={"Authorization": "Bearer %s" % body["access_token"]}
    )
    assert whoami.status_code == 200

    replay = await client.post("/api/auth/oauth/exchange", json={"code": code})
    assert replay.status_code == 400


async def test_oauth_exchange_rejects_unknown_code(client):
    response = await client.post(
        "/api/auth/oauth/exchange", json={"code": uuid.uuid4().hex * 2}
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Đụng độ ghi đồng thời — phải ra mã lỗi đúng, không phải 500
# ---------------------------------------------------------------------------

async def test_concurrent_duplicate_register_yields_409_not_500(client):
    """Hai lần đăng ký cùng email gửi song song.

    Câu SELECT kiểm tra trước không chặn được race — cả hai đều thấy email còn
    trống. Ràng buộc unique ở DB mới là chốt chặn, và nó phải hiện ra thành 409
    chứ không phải IntegrityError lọt lên thành 500.
    """
    import asyncio

    email = f"race-{uuid.uuid4().hex[:12]}@example.com"
    payload = {
        "email": email,
        "password": "password123",
        "role": "trainee",
        "full_name": "Nguoi Dua Xe",
    }

    results = await asyncio.gather(
        client.post("/api/auth/register", json=payload),
        client.post("/api/auth/register", json=payload),
    )
    codes = sorted(r.status_code for r in results)
    assert codes == [201, 409], [r.status_code for r in results]


async def test_two_pts_with_the_same_name_get_distinct_slugs(client):
    """Trùng tên là chuyện thường ở VN — slug phải tự tách ra, không được 500."""
    a = await register(client, "pt", "Nguyen Van Trung")
    b = await register(client, "pt", "Nguyen Van Trung")

    slug_a = await pt_slug(client, a)
    slug_b = await pt_slug(client, b)
    assert slug_a != slug_b
    assert slug_b.startswith("nguyen-van-trung")


async def test_favoriting_twice_is_idempotent(client):
    """Bấm tim hai lần (hoặc double-click) không được trả 500."""
    trainee = await register(client, "trainee")
    slug = await pt_slug(client, await register(client, "pt", "Pt Duoc Thich"))

    first = await client.post(
        "/api/favorites", headers=auth_header(trainee), json={"pt_slug": slug}
    )
    second = await client.post(
        "/api/favorites", headers=auth_header(trainee), json={"pt_slug": slug}
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text

    listing = await client.get("/api/favorites/ids", headers=auth_header(trainee))
    assert listing.json().count(slug) == 1, "không được nhân đôi bản ghi yêu thích"


async def test_favorite_ids_excludes_deactivated_pt(client, raw_sql):
    """PT tắt hiển thị (`is_active=False`) thì trang của họ 404 — quả tim đầy
    trỏ tới một link chết còn tệ hơn quả tim trống."""
    trainee = await register(client, "trainee")
    pt = await register(client, "pt", "Pt Se Tat Hien Thi")
    slug = await pt_slug(client, pt)

    response = await client.post(
        "/api/favorites", headers=auth_header(trainee), json={"pt_slug": slug}
    )
    assert response.status_code == 201, response.text
    assert slug in (await client.get("/api/favorites/ids", headers=auth_header(trainee))).json()

    await raw_sql("UPDATE pt_profiles SET is_active = false WHERE slug = :slug", slug=slug)

    ids = (await client.get("/api/favorites/ids", headers=auth_header(trainee))).json()
    assert slug not in ids


# ---------------------------------------------------------------------------
# Số liệu phải theo giờ Việt Nam
# ---------------------------------------------------------------------------

async def test_analytics_buckets_leads_by_vietnam_day(client, raw_sql):
    """Lead lúc 6 giờ sáng giờ VN phải nằm ở ô HÔM NAY, không phải hôm qua.

    6:00 ngày N ở VN là 23:00 ngày N-1 theo UTC. Gom nhóm theo ngày UTC đẩy nó
    sang ô sai, và PT nhìn biểu đồ sẽ thấy lead rơi vào ngày họ không hề nhận.
    """
    from datetime import timedelta

    from app.core.timeutils import now_vn, vn_day_start

    pt = await register(client, "pt", "Pt Mui Gio")
    slug = await pt_slug(client, pt)

    created = await client.post(
        "/api/leads",
        json={
            "pt_slug": slug,
            "trainee_name": "Hoc vien sang som",
            "trainee_phone": "0912345678",
            "goal": "Giam can",
        },
    )
    assert created.status_code == 201, created.text

    # Đẩy lead về 6:00 sáng nay theo giờ VN (= 23:00 hôm qua theo UTC).
    six_am_vn = vn_day_start(now_vn()) + timedelta(hours=6)
    await raw_sql(
        "UPDATE leads SET created_at = :ts WHERE pt_profile_id = "
        "(SELECT id FROM pt_profiles WHERE slug = :slug)",
        ts=six_am_vn,
        slug=slug,
    )

    analytics = await client.get(
        "/api/pts/me/analytics?days=7", headers=auth_header(pt)
    )
    assert analytics.status_code == 200, analytics.text

    today_vn = now_vn().date().isoformat()
    points = {p["date"]: p["count"] for p in analytics.json()["leads_by_day"]}
    assert points.get(today_vn) == 1, (
        f"lead 6h sáng phải thuộc ngày {today_vn}, nhận được {points}"
    )


async def test_closing_a_request_twice_is_rejected(client):
    """Đóng lại lần hai không được ghi đè lý do lần đầu.

    Tỉ lệ "đã tìm được PT" là tín hiệu chuyển đổi thật duy nhất của chợ ngược,
    nên lý do đóng phải là lý do tại thời điểm đóng thật.
    """
    trainee = await register(client, "trainee")
    created = await post_request(client, tokens=trainee)

    first = await client.patch(
        f"/api/requests/{created['id']}/close",
        headers=auth_header(trainee),
        json={"reason": "found_pt"},
    )
    assert first.status_code == 200, first.text
    assert first.json()["close_reason"] == "found_pt"

    second = await client.patch(
        f"/api/requests/{created['id']}/close",
        headers=auth_header(trainee),
        json={"reason": "no_longer_needed"},
    )
    assert second.status_code == 409

    mine = await client.get("/api/requests/mine", headers=auth_header(trainee))
    target = next(r for r in mine.json() if r["id"] == created["id"])
    assert target["close_reason"] == "found_pt", "lý do đóng đầu tiên phải được giữ"


# ---------------------------------------------------------------------------
# Tra cứu lead cho người gửi ẩn danh
# ---------------------------------------------------------------------------

async def submit_lead(client, slug, **overrides):
    body = {
        "pt_slug": slug,
        "trainee_name": "Nguyen Van Gui",
        "trainee_phone": "0912345678",
        "goal": "Giảm cân",
        "area": "Phường Sài Gòn",
        "budget": "300.000đ - 500.000đ/buổi",
        **overrides,
    }
    response = await client.post("/api/leads", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_anonymous_lead_gets_a_tracking_token(client):
    """Mã tra cứu là đường DUY NHẤT để người gửi ẩn danh quay lại xem tình trạng.

    Form quảng cáo "không cần tạo tài khoản", nên phần lớn lead không gắn với
    tài khoản nào — thiếu mã này là họ bấm gửi xong mất dấu hoàn toàn.
    """
    slug = await pt_slug(client, await register(client, "pt", "Pt Nhan Lead"))
    lead = await submit_lead(client, slug)

    assert lead["track_token"], "phải trả về mã tra cứu ngay khi tạo"
    assert len(lead["track_token"]) >= 20, "mã ngắn quá thì đoán được"

    tracked = await client.get(f"/api/leads/track/{lead['track_token']}")
    assert tracked.status_code == 200, tracked.text
    body = tracked.json()
    assert body["status"] == "new"
    assert body["reported_no_contact"] is False


async def test_tracking_page_never_exposes_the_phone(client):
    """Link tra cứu có thể bị chuyển tiếp — nó không được là đường lấy lại SĐT."""
    slug = await pt_slug(client, await register(client, "pt", "Pt Giu Kin"))
    lead = await submit_lead(client, slug, trainee_phone="0987654321")

    body = (await client.get(f"/api/leads/track/{lead['track_token']}")).json()
    assert "trainee_phone" not in body
    assert "0987654321" not in str(body)


async def test_tracking_rejects_unknown_token(client):
    response = await client.get("/api/leads/track/" + "x" * 32)
    assert response.status_code == 404


async def test_lead_list_never_leaks_tracking_tokens(client):
    """Mã chỉ xuất hiện đúng một lần lúc tạo, không có ở endpoint nào khác."""
    pt = await register(client, "pt", "Pt Khong Lo Ma")
    slug = await pt_slug(client, pt)
    lead = await submit_lead(client, slug)

    listing = await client.get("/api/leads", headers=auth_header(pt))
    assert listing.status_code == 200
    assert lead["track_token"] not in listing.text
    assert all("track_token" not in item for item in listing.json())


async def test_trainee_can_report_pt_never_called(client):
    """Tín hiệu từ phía cầu, đối trọng với trạng thái do PT tự khai.

    Cố ý KHÔNG đổi `status` của lead — đó là cột của PT. Hai phía nói hai chuyện
    khác nhau, và chênh lệch giữa chúng mới là thứ đáng xem.
    """
    slug = await pt_slug(client, await register(client, "pt", "Pt Khong Goi"))
    lead = await submit_lead(client, slug)
    token = lead["track_token"]

    reported = await client.post(f"/api/leads/track/{token}/no-contact", json={})
    assert reported.status_code == 200, reported.text
    assert reported.json()["reported_no_contact"] is True
    assert reported.json()["status"] == "new", "không được đụng vào trạng thái của PT"

    # Bấm lại lần nữa vẫn ổn (lũy đẳng), không nhân đôi tín hiệu.
    again = await client.post(f"/api/leads/track/{token}/no-contact", json={})
    assert again.status_code == 200
    assert again.json()["reported_no_contact"] is True


# ---------------------------------------------------------------------------
# Cửa đăng nhập quản trị tách riêng
# ---------------------------------------------------------------------------

async def _make_admin(client, email_hint: str = "quan-tri"):
    """Tạo tài khoản rồi nâng quyền thẳng trong DB — đúng như cách nó xảy ra thật
    (API đăng ký cố ý chỉ nhận pt/trainee)."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from tests.conftest import TEST_DATABASE_URL

    tokens = await register(client, "trainee", "Nguoi Quan Tri")
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = 'admin' WHERE email = :email"),
            {"email": tokens["email"]},
        )
    await engine.dispose()
    return tokens


async def test_admin_cannot_use_the_normal_login(client):
    """Cửa thường có cả OAuth; cho admin đi qua đó là buộc quyền quản trị vào
    độ an toàn của tài khoản Google/Facebook/Zalo."""
    admin = await _make_admin(client)

    response = await client.post(
        "/api/auth/login", json={"email": admin["email"], "password": "password123"}
    )
    assert response.status_code == 403
    assert "/admin/login" in response.json()["detail"]


async def test_admin_logs_in_at_the_admin_door(client):
    admin = await _make_admin(client)

    response = await client.post(
        "/api/auth/admin/login",
        json={"email": admin["email"], "password": "password123"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "admin"


async def test_non_admin_rejected_at_the_admin_door(client):
    pt = await register(client, "pt", "Pt Thuong")

    response = await client.post(
        "/api/auth/admin/login",
        json={"email": pt["email"], "password": "password123"},
    )
    assert response.status_code == 403


async def test_admin_door_does_not_leak_which_accounts_are_admin(client):
    """Mật khẩu sai phải ra 401 chung — giống hệt email không tồn tại.

    Nếu sai mật khẩu trên tài khoản admin trả lỗi khác với sai mật khẩu trên
    tài khoản thường, người dò chỉ cần thử một lượt là biết nên tấn công ai.
    """
    admin = await _make_admin(client)

    wrong_pw = await client.post(
        "/api/auth/admin/login",
        json={"email": admin["email"], "password": "sai-mat-khau"},
    )
    no_such_account = await client.post(
        "/api/auth/admin/login",
        json={"email": "khong-ton-tai@example.com", "password": "sai-mat-khau"},
    )
    assert wrong_pw.status_code == no_such_account.status_code == 401
    assert wrong_pw.json()["detail"] == no_such_account.json()["detail"]


async def test_normal_users_still_log_in_normally(client):
    """Việc tách cửa không được làm phiền người dùng thường."""
    pt = await register(client, "pt", "Pt Van On")
    response = await client.post(
        "/api/auth/login", json={"email": pt["email"], "password": "password123"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "pt"


# ---------------------------------------------------------------------------
# Số liệu quản trị: tổng quan sử dụng + hộp thư góp ý
# ---------------------------------------------------------------------------

async def _admin_header(client):
    admin = await _make_admin(client)
    login = await client.post(
        "/api/auth/admin/login",
        json={"email": admin["email"], "password": "password123"},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": "Bearer %s" % login.json()["access_token"]}


async def test_overview_counts_people_not_just_events(client):
    """Số NGƯỜI là con số quan trọng: 3 lead từ 1 người khác hẳn 3 người.

    Đo mức TĂNG thay vì giá trị tuyệt đối: các test khác trong cùng phiên cũng
    tạo lead, nên khẳng định `people == 1` sẽ đúng khi chạy riêng và sai khi
    chạy cả suite — bất biến thật là "ba lượt cùng một SĐT chỉ thêm một người".
    """
    headers = await _admin_header(client)
    slug = await pt_slug(client, await register(client, "pt", "Pt Nhan Nhieu"))

    def lead_stats(payload):
        f = next(x for x in payload["features"] if x["key"] == "lead")
        return f["people"], f["events"]

    before = lead_stats(
        (await client.get("/api/admin/overview?days=30", headers=headers)).json()
    )

    unique_phone = "0911%06d" % (uuid.uuid4().int % 1000000)
    for i in range(3):
        await submit_lead(client, slug, trainee_phone=unique_phone, goal="Lan %d" % i)

    after = lead_stats(
        (await client.get("/api/admin/overview?days=30", headers=headers)).json()
    )

    assert after[1] - before[1] == 3, "phải ghi nhận đủ 3 lượt"
    assert after[0] - before[0] == 1, "ba lượt từ một SĐT chỉ được tính là một người"


async def test_overview_reports_profile_completeness(client):
    """Hồ sơ thiếu giá/địa điểm thì học viên không chọn được — phải đếm riêng."""
    headers = await _admin_header(client)
    await register(client, "pt", "Pt Ho So Trong")

    data = (await client.get("/api/admin/overview", headers=headers)).json()
    assert data["pt_profiles"] >= 1
    # Hồ sơ vừa đăng ký chưa có giá và chưa có địa điểm.
    assert data["pt_with_pricing"] < data["pt_profiles"]
    assert data["pt_with_location"] < data["pt_profiles"]


async def test_overview_requires_admin(client):
    pt = await register(client, "pt")
    response = await client.get("/api/admin/overview", headers=auth_header(pt))
    assert response.status_code == 403


async def test_feedback_inbox_reads_what_users_submitted(client):
    """Trước đây bảng feedbacks chỉ có đường ghi — không gì đọc ra được."""
    headers = await _admin_header(client)

    sent = await client.post(
        "/api/feedback",
        json={
            "category": "bug",
            "message": "Bo loc khu vuc khong ra ket qua nao",
            "contact_email": "nguoigui@example.com",
        },
    )
    assert sent.status_code == 201

    inbox = await client.get("/api/admin/feedback", headers=headers)
    assert inbox.status_code == 200, inbox.text
    body = inbox.json()
    assert body["total"] >= 1
    top = body["items"][0]
    assert top["message"] == "Bo loc khu vuc khong ra ket qua nao"
    # Email liên hệ thu về để hồi âm — phải lấy ra được, không thì thu làm gì.
    assert top["contact_email"] == "nguoigui@example.com"
    assert top["handled_at"] is None


async def test_feedback_handled_toggle_is_reversible(client):
    headers = await _admin_header(client)
    await client.post(
        "/api/feedback", json={"category": "ui", "message": "Chu hoi nho tren dien thoai"}
    )

    inbox = (await client.get("/api/admin/feedback", headers=headers)).json()
    fid = inbox["items"][0]["id"]
    pending_before = inbox["pending"]

    marked = await client.patch(f"/api/admin/feedback/{fid}", headers=headers)
    assert marked.status_code == 200
    assert marked.json()["handled_at"] is not None

    after = (await client.get("/api/admin/feedback", headers=headers)).json()
    assert after["pending"] == pending_before - 1

    # Bấm lại thì bỏ đánh dấu — nhỡ tay không mất dấu góp ý.
    unmarked = await client.patch(f"/api/admin/feedback/{fid}", headers=headers)
    assert unmarked.json()["handled_at"] is None


async def test_feedback_only_pending_filter(client):
    headers = await _admin_header(client)
    for i in range(2):
        await client.post(
            "/api/feedback", json={"category": "other", "message": "Gop y so %d" % i}
        )

    inbox = (await client.get("/api/admin/feedback", headers=headers)).json()
    await client.patch(f"/api/admin/feedback/{inbox['items'][0]['id']}", headers=headers)

    pending = (
        await client.get("/api/admin/feedback?only_pending=true", headers=headers)
    ).json()
    assert all(i["handled_at"] is None for i in pending["items"])
    assert pending["total"] == inbox["total"] - 1


async def test_feedback_inbox_requires_admin(client):
    trainee = await register(client, "trainee")
    response = await client.get("/api/admin/feedback", headers=auth_header(trainee))
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Kiểm duyệt đánh giá
# ---------------------------------------------------------------------------

async def _anon_review(client, slug, **overrides):
    body = {
        "reviewer_name": "Nguoi La",
        "reviewer_phone": "09%08d" % (uuid.uuid4().int % 100000000),
        "rating": 1,
        "content": "Danh gia pha hoai",
        **overrides,
    }
    response = await client.post(f"/api/pts/{slug}/reviews", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_admin_can_delete_an_anonymous_review(client):
    """Trước đây đánh giá ẩn danh KHÔNG AI xoá được.

    `trainee_id = NULL` không khớp `trainee_id == user.id` của bất kỳ ai, nên một
    đánh giá 1 sao phá hoại là bất khả xâm phạm qua API — đường duy nhất còn lại
    là SQL tay, mà xoá bằng SQL thì phải tự tính lại avg_rating.
    """
    pt = await register(client, "pt", "Pt Bi Pha Hoai")
    slug = await pt_slug(client, pt)
    review = await _anon_review(client, slug)

    admin_headers = await _admin_header(client)
    deleted = await client.delete(f"/api/reviews/{review['id']}", headers=admin_headers)
    assert deleted.status_code == 204, deleted.text

    listing = await client.get(f"/api/pts/{slug}/reviews")
    assert all(r["id"] != review["id"] for r in listing.json()["items"])


async def test_deleting_a_review_recomputes_the_public_rating(client):
    """avg_rating/review_count là cột phi chuẩn hoá — xoá mà không tính lại là
    để điểm công khai sai vĩnh viễn, không báo lỗi và không cách nào phát hiện."""
    pt = await register(client, "pt", "Pt Diem Phai Dung")
    slug = await pt_slug(client, pt)

    trainee = await register(client, "trainee")
    good = await client.post(
        f"/api/pts/{slug}/reviews",
        headers=auth_header(trainee),
        json={"reviewer_name": "Hoc vien", "rating": 5},
    )
    assert good.status_code == 201

    before = (await client.get(f"/api/pts/{slug}")).json()
    assert before["avg_rating"] == pytest.approx(5.0)

    bad = await _anon_review(client, slug, rating=1)
    during = (await client.get(f"/api/pts/{slug}")).json()
    assert during["avg_rating"] == pytest.approx(3.0), "một review 1 sao phải kéo điểm xuống"

    admin_headers = await _admin_header(client)
    assert (
        await client.delete(f"/api/reviews/{bad['id']}", headers=admin_headers)
    ).status_code == 204

    after = (await client.get(f"/api/pts/{slug}")).json()
    assert after["avg_rating"] == pytest.approx(5.0), "xoá xong điểm phải trở lại đúng"
    assert after["review_count"] == before["review_count"]


async def test_pt_cannot_delete_a_review_about_themselves(client):
    """Cố ý KHÔNG cho phép.

    Cho PT xoá đánh giá về chính mình là phá huỷ đúng tín hiệu niềm tin mà chợ
    dựa vào — họ chỉ giữ lại một điểm hoàn toàn có lợi cho mình. Công cụ của PT
    là trả lời công khai, không phải xoá.
    """
    pt = await register(client, "pt", "Pt Muon Xoa")
    slug = await pt_slug(client, pt)
    review = await _anon_review(client, slug)

    response = await client.delete(f"/api/reviews/{review['id']}", headers=auth_header(pt))
    assert response.status_code == 403

    # Và đánh giá vẫn còn đó.
    listing = await client.get(f"/api/pts/{slug}/reviews")
    assert any(r["id"] == review["id"] for r in listing.json()["items"])


async def test_trainee_cannot_delete_someone_elses_review(client):
    """Việc mở quyền cho admin không được làm lỏng quyền của người dùng thường."""
    slug = await pt_slug(client, await register(client, "pt", "Pt Co Danh Gia"))
    review = await _anon_review(client, slug)

    stranger = await register(client, "trainee")
    response = await client.delete(
        f"/api/reviews/{review['id']}", headers=auth_header(stranger)
    )
    assert response.status_code == 403


async def test_admin_cannot_edit_review_content(client):
    """Admin xoá được nhưng KHÔNG sửa được nội dung.

    Sửa lời người khác rồi để nguyên tên họ còn tệ hơn xoá — người đọc tưởng đó
    là điều người viết nói. Kiểm duyệt là bỏ đi, không phải viết lại.
    """
    slug = await pt_slug(client, await register(client, "pt", "Pt Khong Bi Sua"))
    review = await _anon_review(client, slug)

    admin_headers = await _admin_header(client)
    response = await client.patch(
        f"/api/reviews/{review['id']}",
        headers=admin_headers,
        json={"content": "Noi dung bi admin sua"},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Điều kiện hiển thị hồ sơ (app/services/listing.py)
# ---------------------------------------------------------------------------

async def test_empty_profile_stays_out_of_public_listing(client):
    """Hồ sơ vừa đăng ký không được nằm giữa những hồ sơ thật.

    Đăng ký tạo sẵn PTProfile với is_active = True, nên trước đây một tài khoản
    không ảnh, không giá, không khu vực đã đứng ngay trên /pts. Vài hồ sơ như
    vậy là đủ để người xem kết luận cả trang là chợ rác — đắt nhất đúng lúc đang
    mua lưu lượng.
    """
    pt = await register(client, "pt", "Le Van Trong")
    slug = await pt_slug(client, pt)

    listing = await client.get("/api/pts", params={"q": "Le Van Trong"})
    assert listing.status_code == 200
    assert all(item["slug"] != slug for item in listing.json()["items"])

    # Nhưng truy cập thẳng vẫn được: PT phải xem trước được trang của mình.
    assert (await client.get(f"/api/pts/{slug}")).status_code == 200

    await make_listable(client, pt)
    listing = await client.get("/api/pts", params={"q": "Le Van Trong"})
    assert any(item["slug"] == slug for item in listing.json()["items"])


async def test_profile_tells_the_pt_what_is_missing(client):
    """PT phải biết vì sao mình chưa xuất hiện, nếu không họ kết luận nhầm là
    nền tảng không có người dùng."""
    pt = await register(client, "pt", "Tran Thi Thieu")

    me = (await client.get("/api/pts/me", headers=auth_header(pt))).json()
    assert set(me["missing_listing"]) == {"avatar", "price", "location"}

    await make_listable(client, pt)
    me = (await client.get("/api/pts/me", headers=auth_header(pt))).json()
    assert me["missing_listing"] == []


async def test_zero_price_does_not_count_as_a_price(client):
    """Giá 0 là chưa điền, không phải "miễn phí"."""
    pt = await register(client, "pt", "Nguyen Van Khong")
    await make_listable(client, pt)
    saved = await client.put(
        "/api/pts/me",
        headers=auth_header(pt),
        json={"pricing": {"per_session": 0}},
    )
    assert saved.status_code == 200
    assert "price" in saved.json()["missing_listing"]


# ---------------------------------------------------------------------------
# Kiểm duyệt đánh giá (alembic 0015)
# ---------------------------------------------------------------------------

async def test_new_review_shows_immediately(client):
    """Đánh giá lên hồ sơ ngay, không qua hàng chờ.

    Từng có hàng chờ duyệt, đã bỏ: nó chỉ có nghĩa khi ngày nào cũng có người
    trực, mà một hàng chờ không ai trực thì đánh giá THẬT không bao giờ xuất
    hiện — tệ hơn hẳn so với thi thoảng lọt một cái giả.
    """
    pt = await register(client, "pt", "Pt Hien Ngay")
    slug = await pt_slug(client, pt)
    review = await _anon_review(client, slug, rating=5)

    listing = await client.get(f"/api/pts/{slug}/reviews")
    assert [r["id"] for r in listing.json()["items"]] == [review["id"]]
    assert (await client.get(f"/api/pts/{slug}")).json()["avg_rating"] == pytest.approx(5.0)


async def test_admin_can_hide_and_restore_a_review(client):
    """Kiểm duyệt chuyển từ chặn trước sang xử lý sau: gỡ xuống được, và bật
    lại được vì gỡ nhầm là chuyện có thật."""
    pt = await register(client, "pt", "Pt Bi Go")
    slug = await pt_slug(client, pt)
    review = await _anon_review(client, slug, rating=1)
    assert (await client.get(f"/api/pts/{slug}")).json()["review_count"] == 1

    await set_review_visible(client, review["id"], visible=False)
    profile = (await client.get(f"/api/pts/{slug}")).json()
    assert profile["review_count"] == 0
    assert profile["avg_rating"] == 0
    assert (await client.get(f"/api/pts/{slug}/reviews")).json()["total"] == 0

    await set_review_visible(client, review["id"], visible=True)
    assert (await client.get(f"/api/pts/{slug}/reviews")).json()["total"] == 1


async def test_editing_a_review_keeps_it_visible(client):
    """Sửa nội dung KHÔNG được làm đánh giá biến mất.

    Trước đây sửa là đưa về hàng chờ. Khi không còn ai trực hàng chờ, điều đó
    nghĩa là người sửa một lỗi chính tả mất luôn đánh giá của mình.
    """
    pt = await register(client, "pt", "Pt Bi Sua")
    slug = await pt_slug(client, pt)
    trainee = await register(client, "trainee")

    created = await client.post(
        f"/api/pts/{slug}/reviews",
        headers=auth_header(trainee),
        json={"reviewer_name": "Hoc vien", "rating": 5, "content": "Rat tot"},
    )
    assert created.status_code == 201

    edited = await client.patch(
        f"/api/reviews/{created.json()['id']}",
        headers=auth_header(trainee),
        json={"content": "Rat tot, da sua chinh ta"},
    )
    assert edited.status_code == 200
    assert edited.json()["approved_at"] is not None

    listing = await client.get(f"/api/pts/{slug}/reviews")
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["content"] == "Rat tot, da sua chinh ta"


async def test_only_admin_can_hide_a_review(client):
    pt = await register(client, "pt", "Pt Tu Go")
    slug = await pt_slug(client, pt)
    review = await _anon_review(client, slug, rating=5)

    # PT tự gỡ đánh giá xấu về mình thì tín hiệu niềm tin của cả chợ vô nghĩa.
    response = await client.patch(
        f"/api/admin/reviews/{review['id']}",
        headers=auth_header(pt),
        json={"approved": False},
    )
    assert response.status_code == 403

    trainee = await register(client, "trainee")
    response = await client.patch(
        f"/api/admin/reviews/{review['id']}",
        headers=auth_header(trainee),
        json={"approved": False},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Đổi vai trò + đặt lại mật khẩu (tự phục vụ, không cần admin can thiệp)
# ---------------------------------------------------------------------------

async def test_trainee_can_become_pt(client):
    """Vai trò chỉ được ghi một lần lúc tạo user, mà /login mặc định "học viên".

    PT tới từ group Facebook bấm "Đăng nhập với Facebook" ở /login sẽ thành học
    viên vĩnh viễn. Trước endpoint này, đường sửa duy nhất là SQL tay.
    """
    trainee = await register(client, "trainee", "Nguyen Van Chuyen")

    # Trước khi chuyển: mọi endpoint của PT đều từ chối (403 — chặn ngay ở tầng
    # vai trò, chưa tới bước tìm hồ sơ).
    assert (await client.get("/api/pts/me", headers=auth_header(trainee))).status_code == 403

    response = await client.post(
        "/api/auth/become-pt", headers=auth_header(trainee), json={}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "pt"

    # Token mới phải mang role "pt" — nếu không, người vừa đổi vai trò vẫn bị
    # từ chối cho tới khi access token cũ hết hạn.
    me = await client.get(
        "/api/pts/me",
        headers={"Authorization": "Bearer %s" % body["access_token"]},
    )
    assert me.status_code == 200, me.text
    assert me.json()["full_name"] == "Nguyen Van Chuyen"


async def test_become_pt_is_idempotent(client):
    """Bấm hai lần không được tạo hồ sơ thứ hai."""
    trainee = await register(client, "trainee", "Le Thi Hai Lan")
    first = await client.post(
        "/api/auth/become-pt", headers=auth_header(trainee), json={}
    )
    assert first.status_code == 200
    headers = {"Authorization": "Bearer %s" % first.json()["access_token"]}
    slug_before = (await client.get("/api/pts/me", headers=headers)).json()["slug"]

    second = await client.post("/api/auth/become-pt", headers=headers, json={})
    assert second.status_code == 200, second.text
    headers = {"Authorization": "Bearer %s" % second.json()["access_token"]}
    assert (await client.get("/api/pts/me", headers=headers)).json()["slug"] == slug_before


async def test_become_pt_can_set_display_name(client):
    trainee = await register(client, "trainee", "Tran Van Ten Cu")
    response = await client.post(
        "/api/auth/become-pt",
        headers=auth_header(trainee),
        json={"full_name": "HLV Tran Van Moi"},
    )
    assert response.status_code == 200
    headers = {"Authorization": "Bearer %s" % response.json()["access_token"]}
    assert (await client.get("/api/pts/me", headers=headers)).json()["full_name"] == "HLV Tran Van Moi"


async def test_forgot_password_never_reveals_whether_the_email_exists(client):
    """Phân biệt "email không tồn tại" với "đã gửi" là biếu không công cụ dò
    xem địa chỉ nào đã đăng ký."""
    known = await register(client, "trainee")

    for email in (known["email"], "khong-ton-tai-%s@example.com" % uuid.uuid4().hex[:8]):
        response = await client.post("/api/auth/forgot-password", json={"email": email})
        assert response.status_code == 202, response.text


async def test_password_reset_token_works_once(client):
    from app.core.redis import get_redis

    user = await register(client, "trainee", "Pham Thi Quen")
    assert (
        await client.post("/api/auth/forgot-password", json={"email": user["email"]})
    ).status_code == 202

    # Lấy token thẳng từ Redis: nội dung thư không phải thứ test này kiểm.
    #
    # Phải đối chiếu giá trị (user_id) chứ không lấy khoá đầu tiên: Redis dùng
    # chung cho cả phiên test, nên các test khác cũng để lại token ở đây và lấy
    # bừa một cái sẽ đặt lại mật khẩu cho nhầm người.
    r = get_redis()
    token = None
    async for key in r.scan_iter("pwreset:*"):
        key = key if isinstance(key, str) else key.decode()
        owner = await r.get(key)
        owner = owner if isinstance(owner, str) else (owner or b"").decode()
        if owner == user["user"]["id"]:
            token = key.split(":", 1)[1]
            break
    assert token, "phải có token đặt lại mật khẩu của chính user này trong Redis"

    reset = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "matkhaumoi123"}
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["user"]["email"] == user["email"]

    # Đăng nhập được bằng mật khẩu mới...
    login = await client.post(
        "/api/auth/login", json={"email": user["email"], "password": "matkhaumoi123"}
    )
    assert login.status_code == 200, login.text

    # ...và token đã bị tiêu huỷ, dùng lại lần hai phải hỏng.
    replay = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "matkhaukhac123"}
    )
    assert replay.status_code == 400


async def test_reset_password_revokes_sessions_issued_before_the_reset(client):
    """Kẻ đã trộm được refresh/access token của victim giữ phiên tới hết hạn
    (30 ngày) kể cả sau khi victim "khôi phục" bằng cách đặt lại mật khẩu —
    trước đây reset-password chỉ cấp token mới, không thu hồi token cũ."""
    from app.core.redis import get_redis

    victim = await register(client, "trainee", "Nan Nhan Bi Trom Token")
    stolen_access = auth_header(victim)
    stolen_refresh = victim["refresh_token"]

    # Phiên cũ còn dùng được TRƯỚC khi reset — chốt lại để phép so sánh có
    # nghĩa (không phải lúc nào cũng hỏng).
    assert (await client.get("/api/auth/me", headers=stolen_access)).status_code == 200

    assert (
        await client.post("/api/auth/forgot-password", json={"email": victim["email"]})
    ).status_code == 202
    r = get_redis()
    token = None
    async for key in r.scan_iter("pwreset:*"):
        key = key if isinstance(key, str) else key.decode()
        owner = await r.get(key)
        owner = owner if isinstance(owner, str) else (owner or b"").decode()
        if owner == victim["user"]["id"]:
            token = key.split(":", 1)[1]
            break
    assert token

    reset = await client.post(
        "/api/auth/reset-password", json={"token": token, "password": "matkhaumoicuavictim"}
    )
    assert reset.status_code == 200, reset.text

    # Access token cấp TRƯỚC reset không còn dùng được...
    stale_access = await client.get("/api/auth/me", headers=stolen_access)
    assert stale_access.status_code == 401, stale_access.text

    # ...và refresh token cấp trước reset cũng vậy — kẻ trộm không lấy lại
    # được access token mới bằng nó.
    stale_refresh = await client.post(
        "/api/auth/refresh", json={"refresh_token": stolen_refresh}
    )
    assert stale_refresh.status_code == 401, stale_refresh.text

    # Nhưng token MỚI mà chính reset-password vừa cấp thì vẫn dùng được —
    # không tự khoá luôn người vừa đặt lại mật khẩu.
    fresh_access = auth_header(reset.json())
    assert (await client.get("/api/auth/me", headers=fresh_access)).status_code == 200


async def test_reset_password_rejects_unknown_token(client):
    response = await client.post(
        "/api/auth/reset-password",
        json={"token": "khong-phai-token-that-nhung-du-dai", "password": "matkhaumoi123"},
    )
    assert response.status_code == 400


async def test_oauth_exchange_reports_whether_the_account_is_new(client):
    """`is_new` phải đi được tới tận response.

    Đây là tín hiệu duy nhất để frontend biết phải hỏi lại vai trò tại
    /welcome. Nó từng bị `response_model` cũ lọc mất trong im lặng — endpoint
    vẫn trả 200, chỉ thiếu đúng trường đó, và cái bẫy "PT thành học viên vĩnh
    viễn" âm thầm quay lại.
    """
    import json as _json

    from app.core.redis import get_redis

    user = await register(client, "trainee", "Vo Thi Moi")
    r = get_redis()

    for is_new in (True, False):
        code = "t" + uuid.uuid4().hex
        await r.set(
            f"oauth_exchange:{code}",
            _json.dumps({"user_id": user["user"]["id"], "is_new": is_new}),
            ex=60,
        )
        response = await client.post("/api/auth/oauth/exchange", json={"code": code})
        assert response.status_code == 200, response.text
        assert response.json()["is_new"] is is_new

    # Payload cũ (trước khi có trường này) không được làm hỏng việc đổi mã.
    code = "t" + uuid.uuid4().hex
    await r.set(
        f"oauth_exchange:{code}", _json.dumps({"user_id": user["user"]["id"]}), ex=60
    )
    response = await client.post("/api/auth/oauth/exchange", json={"code": code})
    assert response.status_code == 200
    assert response.json()["is_new"] is False


# ---------------------------------------------------------------------------
# Bổ sung email cho tài khoản mạng xã hội (Zalo không trả email)
# ---------------------------------------------------------------------------

async def _make_social_user(client, name: str = "Nguoi Dung Zalo") -> dict:
    """Tài khoản có email tự sinh, mô phỏng đăng nhập bằng Zalo."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from tests.conftest import TEST_DATABASE_URL

    tokens = await register(client, "pt", name)
    fake = f"zalo.{uuid.uuid4().hex[:12]}@oauth.ptmatch.vn"
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET email = :new WHERE email = :old"),
            {"new": fake, "old": tokens["email"]},
        )
    await engine.dispose()
    tokens["email"] = fake
    return tokens


async def test_social_account_is_flagged_as_needing_email(client):
    """PT đăng nhập bằng Zalo mang email tự sinh — frontend phải biết để hỏi lại.

    Không có cờ này thì họ im lặng không nhận được thông báo lead nào, và ta
    tưởng PT lười không gọi.
    """
    user = await _make_social_user(client)
    login = await client.post(
        "/api/auth/refresh", json={"refresh_token": user["refresh_token"]}
    )
    assert login.status_code == 200, login.text
    assert login.json()["user"]["needs_email"] is True


async def test_get_me_also_flags_needs_email(client):
    """`/auth/login` và `/auth/oauth/exchange` đã điền needs_email từ lâu;
    `/auth/me` (dùng lúc nạp lại trang) từng bị bỏ quên và luôn trả False."""
    user = await _make_social_user(client)
    me = await client.get("/api/auth/me", headers=auth_header(user))
    assert me.status_code == 200, me.text
    assert me.json()["needs_email"] is True


async def test_set_email_fills_in_a_real_address(client):
    user = await _make_social_user(client, "Tran Van Bo Sung")
    real = f"that-{uuid.uuid4().hex[:8]}@example.com"

    response = await client.post(
        "/api/auth/set-email", headers=auth_header(user), json={"email": real}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["email"] == real
    assert body["user"]["needs_email"] is False


async def test_set_email_refuses_when_account_already_has_a_real_one(client):
    """KHÔNG phải chức năng "đổi email".

    Mở cho mọi tài khoản đổi tự do là mở đường chiếm tài khoản: mượn được phiên
    một lúc là đổi email rồi chiếm bằng quên-mật-khẩu.
    """
    normal = await register(client, "trainee", "Nguoi Co Email That")
    response = await client.post(
        "/api/auth/set-email",
        headers=auth_header(normal),
        json={"email": f"khac-{uuid.uuid4().hex[:8]}@example.com"},
    )
    assert response.status_code == 409


async def test_set_email_rejects_an_address_already_in_use(client):
    other = await register(client, "trainee", "Nguoi Da Co")
    user = await _make_social_user(client, "Le Thi Trung")

    response = await client.post(
        "/api/auth/set-email", headers=auth_header(user), json={"email": other["email"]}
    )
    assert response.status_code == 409


async def test_notification_reaches_a_social_pt_after_they_add_an_email(client):
    """Đây mới là lý do tồn tại của cả tính năng: trước khi bổ sung email thì
    kênh email BỎ QUA, sau khi bổ sung thì gửi được."""
    from app.services.channels.base import LeadNotification, Recipient
    from app.services.channels.email import EmailChannel

    payload = LeadNotification(
        pt_name="PT", trainee_name="Hoc vien", trainee_phone="0900000000",
        goal=None, area=None, budget=None,
    )
    with patch("app.services.mailer.settings") as s:
        s.smtp_host = "smtp.example.com"
        before = EmailChannel().send_lead(
            Recipient(email="zalo.999@oauth.ptmatch.vn"), payload
        )
    assert before.skipped is True and before.ok is False


# ---------------------------------------------------------------------------
# Trọn luồng đăng ký bằng Zalo
#
# Chạy được mà KHÔNG cần App ID thật: chỉ giả lập bước gọi sang Zalo. Nhờ vậy
# khi có khoá thật, lỗi nào xảy ra cũng chắc chắn là do cấu hình chứ không phải
# do dây nối bên trong.
# ---------------------------------------------------------------------------

async def test_zalo_signup_creates_pt_with_placeholder_email_and_avatar(client):
    import json as _json
    from unittest.mock import patch as _patch
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.core.redis import get_redis
    from app.services.oauth import OAuthUserInfo

    zalo_id = uuid.uuid4().hex[:12]
    fake_info = OAuthUserInfo(
        provider="zalo",
        provider_id=zalo_id,
        email=f"zalo.{zalo_id}@oauth.ptmatch.vn",
        full_name="Nguyen Van Zalo",
        avatar_url="https://images.unsplash.com/anh-dai-dien.jpg",
        email_verified=False,
    )

    with _patch.object(settings, "zalo_app_id", "fake-app-id"), _patch.object(
        settings, "zalo_app_secret", "fake-secret"
    ):
        # 1. Bấm nút Zalo -> chuyển hướng sang Zalo, kèm PKCE challenge.
        start = await client.get(
            "/api/auth/zalo/login", params={"role": "pt"}, follow_redirects=False
        )
        assert start.status_code in (302, 307), start.text
        params = parse_qs(urlparse(start.headers["location"]).query)
        assert params["app_id"] == ["fake-app-id"]
        assert params["code_challenge"][0], "thiếu PKCE code_challenge"
        state = params["state"][0]

        # code_verifier phải được cất cùng state, nếu không bước đổi mã sẽ hỏng.
        stored = _json.loads(await get_redis().get(f"oauth_state:{state}"))
        assert stored["provider"] == "zalo"
        assert stored["role"] == "pt"
        assert stored["code_verifier"]

        # 2. Zalo gọi ngược về callback.
        with _patch("app.api.auth.exchange_zalo_code", return_value=fake_info):
            callback = await client.get(
                "/api/auth/zalo/callback",
                params={"code": "zalo-auth-code", "state": state},
                follow_redirects=False,
            )
    assert callback.status_code in (302, 307), callback.text
    exchange_code = parse_qs(urlparse(callback.headers["location"]).query)["code"][0]

    # 3. Frontend đổi mã lấy token.
    exchanged = await client.post("/api/auth/oauth/exchange", json={"code": exchange_code})
    assert exchanged.status_code == 200, exchanged.text
    body = exchanged.json()

    assert body["is_new"] is True, "tài khoản mới phải được đánh dấu để /welcome hỏi vai trò"
    assert body["user"]["role"] == "pt"
    # Zalo không trả email -> địa chỉ tự sinh, và phải bị gắn cờ cần bổ sung.
    assert body["user"]["email"].endswith("@oauth.ptmatch.vn")
    assert body["user"]["needs_email"] is True

    # 4. Hồ sơ PT được tạo, và ảnh đại diện lấy sẵn từ Zalo — thoả sẵn một trong
    #    ba điều kiện hiển thị, nên /welcome chỉ còn phải hỏi giá và khu vực.
    me = await client.get(
        "/api/pts/me",
        headers={"Authorization": "Bearer %s" % body["access_token"]},
    )
    assert me.status_code == 200, me.text
    profile = me.json()
    assert profile["full_name"] == "Nguyen Van Zalo"
    assert profile["avatar_url"] == "https://images.unsplash.com/anh-dai-dien.jpg"
    assert set(profile["missing_listing"]) == {"price", "location"}


async def test_zalo_signup_never_merges_into_an_existing_email_account(client):
    """Email của tài khoản Zalo là địa chỉ ta tự bịa ra.

    Gộp theo nó nghĩa là ai đoán đúng zalo_id là chiếm được tài khoản người khác.
    """
    from unittest.mock import patch as _patch
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services.oauth import OAuthUserInfo

    victim = await register(client, "trainee", "Nguoi Dung Cu")

    with _patch.object(settings, "zalo_app_id", "fake-app-id"):
        start = await client.get(
            "/api/auth/zalo/login", params={"role": "pt"}, follow_redirects=False
        )
        state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

        # Kẻ tấn công khai email của nạn nhân trong dữ liệu trả về từ "Zalo".
        forged = OAuthUserInfo(
            provider="zalo",
            provider_id=uuid.uuid4().hex[:12],
            email=victim["email"],
            full_name="Ke Mao Danh",
            avatar_url=None,
            email_verified=False,
        )
        with _patch("app.api.auth.exchange_zalo_code", return_value=forged):
            callback = await client.get(
                "/api/auth/zalo/callback",
                params={"code": "x", "state": state},
                follow_redirects=False,
            )

    location = callback.headers["location"]
    # Hoặc bị chặn thẳng, hoặc tạo tài khoản MỚI — tuyệt đối không cấp phiên cho
    # tài khoản của nạn nhân.
    if "oauth_error" not in location:
        code = parse_qs(urlparse(location).query)["code"][0]
        body = (await client.post("/api/auth/oauth/exchange", json={"code": code})).json()
        assert body["user"]["id"] != str(victim["user"]["id"])
        assert body["user"]["email"] != victim["email"]
