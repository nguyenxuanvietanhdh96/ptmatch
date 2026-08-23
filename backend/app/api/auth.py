import json
import secrets
import urllib.parse
import uuid
from datetime import datetime, timezone

import jwt
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, token_predates_credentials_change
from app.core.config import settings
from app.core.database import get_db
from app.core.ratelimit import limiter
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import PTProfile, User, UserRole
from app.schemas.auth import (
    BecomePTRequest,
    ForgotPasswordRequest,
    LoginRequest,
    OAuthExchangeRequest,
    OAuthTokenResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SetEmailRequest,
    TokenResponse,
    UserOut,
)
from app.services.oauth import (
    OAuthUserInfo,
    build_facebook_auth_url,
    build_google_auth_url,
    build_zalo_auth_url,
    exchange_facebook_code,
    exchange_google_code,
    exchange_zalo_code,
    generate_pkce,
)
from app.services.identity import is_placeholder_email, placeholder_email
from app.services.mailer import send_email
from app.services.slug import generate_unique_slug
from app.services.tokens import is_token_revoked, revoke_token

router = APIRouter(prefix="/auth", tags=["auth"])

_OAUTH_STATE_TTL = 600  # 10 phút

# Mã đổi token chỉ cần sống đủ để trình duyệt nhảy từ redirect sang lời gọi
# POST /auth/exchange — vài giây. 60s là dư dả cho mạng chậm mà vẫn thu hẹp tối
# đa khoảng thời gian mã nằm trong lịch sử trình duyệt còn dùng được.
_OAUTH_EXCHANGE_TTL = 60

# Hạn của link đặt lại mật khẩu. Ngắn vì nó nằm trong hộp thư — nơi mà một tài
# khoản email bị chiếm sẽ quét lại được toàn bộ thư cũ.
_RESET_TOKEN_TTL = 1800  # 30 phút

# Số lần thử chèn hồ sơ PT khi slug bị PT khác giành mất giữa lúc kiểm tra và
# lúc chèn. Thực tế gần như không bao giờ chạm tới lần thứ hai.
_SLUG_INSERT_ATTEMPTS = 3


async def _full_name_for(db: AsyncSession, user: User) -> "str | None":
    # For PTs the profile name is the source of truth — they can rename it in
    # the dashboard, and user.full_name (set at register) would go stale.
    if user.role == UserRole.pt:
        profile_name = await db.scalar(
            select(PTProfile.full_name).where(PTProfile.user_id == user.id)
        )
        return profile_name or user.full_name
    return user.full_name


async def _create_pt_profile(
    db: AsyncSession, user: User, full_name: "str | None"
) -> PTProfile:
    """Tạo hồ sơ PT cho một user, dùng chung cho đăng ký thường, OAuth và
    chuyển vai trò.

    Chép `oauth_avatar_url` sang `PTProfile.avatar_url`: ảnh đại diện là một
    trong ba điều kiện để hồ sơ được hiển thị công khai (xem
    app/services/listing.py), mà nhà cung cấp OAuth đã đưa sẵn ảnh cho mình.
    Bỏ qua nó nghĩa là bắt PT tự tải lên đúng tấm ảnh họ vừa cho phép mình đọc —
    một bước thừa ngay tại chỗ dễ bỏ cuộc nhất.
    """
    name = (full_name or user.full_name or "").strip()
    slug = await generate_unique_slug(db, name or "pt")
    profile = PTProfile(
        user_id=user.id,
        slug=slug,
        full_name=name,
        avatar_url=user.oauth_avatar_url,
    )
    db.add(profile)
    return profile


def _token_response(user: User, full_name: "str | None") -> TokenResponse:
    user_id = str(user.id)
    role = user.role.value
    return TokenResponse(
        access_token=create_access_token(user_id, role),
        refresh_token=create_refresh_token(user_id, role),
        user=UserOut(
            id=user.id,
            email=user.email,
            role=role,
            full_name=full_name,
            phone=user.phone,
            needs_email=is_placeholder_email(user.email),
        ),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(User.id).where(User.email == body.email.lower()))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email.lower(),
        full_name=body.full_name,
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
    )
    db.add(user)

    # Câu SELECT ở trên chỉ để trả lỗi 409 dễ hiểu; nó KHÔNG chặn được race.
    # Hai lần đăng ký cùng email gửi đồng thời đều lọt qua, và trước đây lần thứ
    # hai làm vỡ ràng buộc unique rồi trả 500. Ràng buộc DB mới là chốt chặn
    # thật, nên bắt IntegrityError và quy về đúng 409 đó.
    #
    # Dùng savepoint để tách hai loại đụng độ: trùng email là lỗi của người dùng
    # (409), còn trùng slug chỉ là hai PT trùng tên đăng ký cùng lúc — chuyện
    # nội bộ, phải tự thử lại chứ không được báo "email đã tồn tại".
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    if user.role == UserRole.pt:
        for attempt in range(_SLUG_INSERT_ATTEMPTS):
            slug = await generate_unique_slug(db, body.full_name)
            try:
                async with db.begin_nested():
                    db.add(PTProfile(
                        user_id=user.id,
                        slug=slug,
                        full_name=body.full_name,
                    ))
                    await db.flush()
                break
            except IntegrityError:
                # Savepoint đã cuộn lại, user vẫn còn — lấy slug khác rồi thử lại.
                if attempt == _SLUG_INSERT_ATTEMPTS - 1:
                    await db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Không tạo được hồ sơ, vui lòng thử lại.",
                    )

    await db.commit()
    return _token_response(user, body.full_name)


async def _authenticate(db: AsyncSession, email: str, password: str) -> User:
    """Xác thực email/mật khẩu. Ném 401 chung cho mọi kiểu thất bại.

    Cùng một thông báo cho "email không tồn tại" và "sai mật khẩu": phân biệt hai
    trường hợp là biếu không công cụ dò xem tài khoản nào có thật.
    """
    user = await db.scalar(select(User).where(User.email == email.lower()))
    # Tài khoản chỉ có OAuth (không có password_hash) không đăng nhập kiểu này được.
    if user is None or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await _authenticate(db, body.email, body.password)

    # Tài khoản admin KHÔNG đăng nhập được ở cửa này.
    #
    # Cửa đăng nhập thường có cả OAuth (Google/Facebook/Zalo). Cho admin đi qua
    # đây nghĩa là quyền quản trị thừa hưởng toàn bộ rủi ro của ba nhà cung cấp
    # bên ngoài: mất tài khoản Google là mất luôn quyền admin. Tách hẳn ra cửa
    # riêng chỉ nhận mật khẩu (xem /auth/admin/login).
    #
    # Thông báo cụ thể chỉ hiện SAU khi mật khẩu đã đúng, nên nó không tiết lộ
    # tài khoản nào là admin cho người chưa có mật khẩu.
    if user.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản quản trị đăng nhập tại /admin/login",
        )

    full_name = await _full_name_for(db, user)
    return _token_response(user, full_name)


@router.post("/admin/login", response_model=TokenResponse)
@limiter.limit("5/minute;20/hour")
async def admin_login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Cửa đăng nhập riêng cho quản trị — chỉ mật khẩu, không OAuth.

    Giới hạn tần suất chặt hơn cửa thường (5/phút thay vì 10): ở đây gần như
    chỉ có một tài khoản mục tiêu, nên mỗi lần thử đều đáng giá với người dò.
    """
    user = await _authenticate(db, body.email, body.password)

    if user.role != UserRole.admin:
        # Chỉ tới được nhánh này khi mật khẩu đã đúng, nên nói rõ là an toàn —
        # và cần thiết, không thì người dùng thường gõ nhầm địa chỉ sẽ bế tắc.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản này không phải quản trị viên. Đăng nhập tại /login.",
        )

    full_name = await _full_name_for(db, user)
    return _token_response(user, full_name)


@router.get("/me", response_model=UserOut)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    full_name = await _full_name_for(db, user)
    return UserOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        full_name=full_name,
        phone=user.phone,
        needs_email=is_placeholder_email(user.email),
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise invalid
    if await is_token_revoked(payload):
        raise invalid

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if token_predates_credentials_change(user, payload):
        raise invalid

    # Rotation: the presented refresh token is burned as soon as it is used, so
    # a leaked copy is only good until the legitimate client next refreshes.
    await revoke_token(payload)

    full_name = await _full_name_for(db, user)
    return _token_response(user, full_name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest):
    """Revoke a refresh token.

    The caller's *access* token stays valid until it expires
    (ACCESS_TOKEN_EXPIRE_MINUTES) — clients should drop it locally.
    """
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except jwt.InvalidTokenError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    await revoke_token(payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# OAuth — Google
# ---------------------------------------------------------------------------

@router.get("/google/login")
async def google_login(
    role: str = Query(default="trainee", pattern="^(pt|trainee)$"),
    next: str | None = Query(default=None, max_length=500),
):
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google login chưa được cấu hình")
    r = get_redis()
    state = uuid.uuid4().hex
    await r.set(
        f"oauth_state:{state}",
        json.dumps({"role": role, "provider": "google", "next": next}),
        ex=_OAUTH_STATE_TTL,
    )
    return RedirectResponse(build_google_auth_url(state))


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_oauth_callback("google", code, state, "", db)


# ---------------------------------------------------------------------------
# OAuth — Facebook
# ---------------------------------------------------------------------------

@router.get("/facebook/login")
async def facebook_login(
    role: str = Query(default="trainee", pattern="^(pt|trainee)$"),
    next: str | None = Query(default=None, max_length=500),
):
    if not settings.facebook_client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Facebook login chưa được cấu hình")
    r = get_redis()
    state = uuid.uuid4().hex
    await r.set(
        f"oauth_state:{state}",
        json.dumps({"role": role, "provider": "facebook", "next": next}),
        ex=_OAUTH_STATE_TTL,
    )
    return RedirectResponse(build_facebook_auth_url(state))


@router.get("/facebook/callback")
async def facebook_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_oauth_callback("facebook", code, state, "", db)


# ---------------------------------------------------------------------------
# OAuth — Zalo
# ---------------------------------------------------------------------------

@router.get("/zalo/login")
async def zalo_login(
    role: str = Query(default="trainee", pattern="^(pt|trainee)$"),
    next: str | None = Query(default=None, max_length=500),
):
    if not settings.zalo_app_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Zalo login chưa được cấu hình")
    r = get_redis()
    state = uuid.uuid4().hex
    code_verifier, code_challenge = generate_pkce()
    await r.set(
        f"oauth_state:{state}",
        json.dumps(
            {"role": role, "provider": "zalo", "code_verifier": code_verifier, "next": next}
        ),
        ex=_OAUTH_STATE_TTL,
    )
    return RedirectResponse(build_zalo_auth_url(state, code_challenge))


@router.get("/zalo/callback")
async def zalo_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_oauth_callback("zalo", code, state, "", db)


# ---------------------------------------------------------------------------
# Shared callback handler
# ---------------------------------------------------------------------------

async def _handle_oauth_callback(
    provider: str,
    code: str,
    state: str,
    _unused: str,
    db: AsyncSession,
) -> RedirectResponse:
    r = get_redis()
    state_key = f"oauth_state:{state}"
    raw = await r.get(state_key)
    if not raw:
        return _oauth_error_redirect("Phiên OAuth hết hạn hoặc không hợp lệ")
    await r.delete(state_key)

    state_data: dict = json.loads(raw)
    role = state_data.get("role", "trainee")
    code_verifier: str = state_data.get("code_verifier", "")
    next_path = state_data.get("next")

    try:
        if provider == "google":
            info: OAuthUserInfo = await exchange_google_code(code)
        elif provider == "facebook":
            info = await exchange_facebook_code(code)
        else:
            info = await exchange_zalo_code(code, code_verifier)
    except Exception:
        return _oauth_error_redirect("Xác thực với nhà cung cấp thất bại")

    # 1. Tìm theo oauth_provider + oauth_id
    user = await db.scalar(
        select(User).where(User.oauth_provider == provider, User.oauth_id == info["provider_id"])
    )

    # 2. Tìm theo email (merge với account email/password cùng email)
    if user is None and info.get("email") and not is_placeholder_email(info["email"]):
        existing = await db.scalar(select(User).where(User.email == info["email"].lower()))
        if existing is not None:
            # Chỉ gộp khi nhà cung cấp KHẲNG ĐỊNH người đăng nhập sở hữu email
            # đó. Không có bảo đảm ấy thì gộp chính là chiếm tài khoản: ai tạo
            # được tài khoản ở phía nhà cung cấp bằng email của nạn nhân sẽ
            # đăng nhập thẳng vào tài khoản PTMatch của nạn nhân.
            #
            # Hiện chỉ Google cung cấp bảo đảm này (claim email_verified).
            if not info.get("email_verified"):
                return _oauth_error_redirect(
                    "Email này đã có tài khoản PTMatch. Vui lòng đăng nhập bằng "
                    "mật khẩu."
                )
            user = existing
            user.oauth_provider = provider
            user.oauth_id = info["provider_id"]
            if info.get("avatar_url") and not user.oauth_avatar_url:
                user.oauth_avatar_url = info["avatar_url"]

    # 3. Tạo mới
    is_new = user is None
    if user is None:
        email = (info.get("email") or placeholder_email(provider, info["provider_id"])).lower()
        user = User(
            email=email,
            full_name=info.get("full_name"),
            password_hash=None,
            oauth_provider=provider,
            oauth_id=info["provider_id"],
            oauth_avatar_url=info.get("avatar_url"),
            role=UserRole(role),
        )
        db.add(user)
        await db.flush()

        if user.role == UserRole.pt:
            await _create_pt_profile(db, user, info.get("full_name"))

    await db.commit()
    await db.refresh(user)

    # Tài khoản quản trị KHÔNG được cấp phiên qua OAuth.
    #
    # Đây mới là chốt chặn thật của việc tách cửa đăng nhập admin. Chặn ở
    # /auth/login mà để ngỏ đường này thì vô nghĩa: chỉ cần bấm "Đăng nhập với
    # Google" bằng email trùng là có phiên admin, và quyền quản trị lại phụ
    # thuộc vào việc giữ tài khoản Google/Facebook/Zalo.
    if user.role == UserRole.admin:
        return _oauth_error_redirect(
            "Tài khoản quản trị phải đăng nhập bằng mật khẩu tại /admin/login"
        )

    # Redirect KHÔNG mang token. Trước đây access_token và refresh_token (hạn 30
    # ngày) nằm thẳng trong query string, nghĩa là chúng đọng lại trong lịch sử
    # trình duyệt, access log của mọi proxy trên đường đi, và lộ ra cho các script
    # đo lường bên thứ ba đang chạy trên /auth/callback qua document.location.
    #
    # Thay bằng mã một lần: chỉ mã này đi qua URL, sống 60 giây, và bị xoá ngay
    # khi frontend đổi lấy token qua POST (body của POST không bị ghi log như URL).
    #
    # Chỉ lưu user_id: token và tên hiển thị được dựng lại từ DB lúc đổi mã, nên
    # không có bản sao dữ liệu nào bị lệch nếu hồ sơ đổi giữa chừng.
    code = secrets.token_urlsafe(32)
    r = get_redis()
    await r.set(
        f"oauth_exchange:{code}",
        json.dumps({"user_id": str(user.id), "is_new": is_new}),
        ex=_OAUTH_EXCHANGE_TTL,
    )

    # `next` chỉ mang qua để frontend tự thẩm định lại (safeNextPath) trước khi
    # dùng — nó không bao giờ tạo redirect thật ở tầng backend, nên không phải
    # điểm hở open-redirect dù giá trị này do người dùng khởi tạo (query
    # `?next=` lúc bấm nút OAuth).
    query = {"code": code}
    if next_path:
        query["next"] = next_path
    params = urllib.parse.urlencode(query)
    return RedirectResponse(f"{settings.frontend_base_url}/auth/callback?{params}")


@router.post("/oauth/exchange", response_model=OAuthTokenResponse)
@limiter.limit("20/minute")
async def oauth_exchange(
    request: Request,
    body: OAuthExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Đổi mã một lần từ redirect OAuth lấy cặp token thật.

    Mã bị tiêu huỷ ngay lúc đọc (GETDEL) nên dùng lại lần hai luôn thất bại —
    kể cả khi ai đó moi được nó từ lịch sử trình duyệt sau này.
    """
    r = get_redis()
    key = f"oauth_exchange:{body.code}"
    raw = await r.getdel(key)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã đăng nhập không hợp lệ hoặc đã hết hạn",
        )

    data = json.loads(raw)
    user = await db.get(User, uuid.UUID(data["user_id"]))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản không còn tồn tại",
        )

    full_name = await _full_name_for(db, user)
    return OAuthTokenResponse(
        **_token_response(user, full_name).model_dump(),
        # Chỉ lượt đăng nhập TẠO tài khoản mới cần hỏi lại vai trò.
        is_new=bool(data.get("is_new")),
    )


@router.post("/become-pt", response_model=TokenResponse)
async def become_pt(
    body: BecomePTRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chuyển tài khoản học viên sang PT (tạo hồ sơ nếu chưa có).

    Vì sao bắt buộc phải có: vai trò chỉ được ghi MỘT LẦN, lúc tạo user
    (`_handle_oauth_callback`). Trang /login có bộ chọn vai trò mặc định là
    "học viên", nên một PT tới từ group Facebook bấm "Đăng nhập với Facebook" ở
    đó sẽ thành học viên vĩnh viễn — không có hồ sơ, không đăng được gì, và
    trước endpoint này thì đường sửa duy nhất là chạy SQL tay.

    Idempotent: gọi lại khi đã là PT thì chỉ trả token mới, không tạo hồ sơ thứ hai.
    """
    if user.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản quản trị không chuyển sang PT được",
        )

    profile = await db.scalar(select(PTProfile).where(PTProfile.user_id == user.id))
    if profile is None:
        for attempt in range(_SLUG_INSERT_ATTEMPTS):
            try:
                async with db.begin_nested():
                    profile = await _create_pt_profile(db, user, body.full_name)
                    await db.flush()
                break
            except IntegrityError:
                # Hai PT trùng tên chuyển vai trò cùng lúc — lấy slug khác rồi thử lại.
                if attempt == _SLUG_INSERT_ATTEMPTS - 1:
                    await db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Không tạo được hồ sơ, vui lòng thử lại.",
                    )
    elif body.full_name:
        profile.full_name = body.full_name.strip()

    user.role = UserRole.pt
    await db.commit()
    await db.refresh(user)

    # Token cũ mang role "trainee" trong payload, nên phải cấp lại — nếu không
    # người dùng vừa đổi vai trò vẫn bị mọi endpoint của PT từ chối cho tới khi
    # access token hết hạn.
    return _token_response(user, await _full_name_for(db, user))


@router.post("/set-email", response_model=TokenResponse)
async def set_email(
    body: SetEmailRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bổ sung email thật cho tài khoản đăng nhập bằng mạng xã hội.

    Zalo không trả email, Facebook thì người dùng từ chối chia sẻ được. Những
    tài khoản đó mang địa chỉ tự sinh trên một tên miền không tồn tại, nên
    **không nhận được thông báo lead nào** — với PT thì đó là mất trắng lý do
    dùng nền tảng.

    CHỈ cho đặt khi địa chỉ hiện tại là địa chỉ tự sinh. Đây không phải chức
    năng "đổi email": mở cho mọi tài khoản đổi tự do là mở luôn đường chiếm tài
    khoản — ai mượn được phiên đăng nhập một lúc là đổi email rồi chiếm bằng
    quên-mật-khẩu. Muốn đổi email thật thì cần luồng xác minh riêng.
    """
    if not is_placeholder_email(user.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tài khoản đã có email. Liên hệ hỗ trợ nếu cần thay đổi.",
        )

    email = body.email.lower()
    taken = await db.scalar(select(User.id).where(User.email == email, User.id != user.id))
    if taken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email này đã được dùng cho tài khoản khác.",
        )

    user.email = email
    try:
        await db.commit()
    except IntegrityError:
        # Hai request song song cùng đặt một địa chỉ — ràng buộc unique ở DB mới
        # là chốt chặn thật, câu SELECT trên chỉ để trả lỗi dễ hiểu.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email này đã được dùng cho tài khoản khác.",
        )
    await db.refresh(user)
    return _token_response(user, await _full_name_for(db, user))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Gửi link đặt lại mật khẩu.

    LUÔN trả 202, kể cả khi email không tồn tại: phân biệt hai trường hợp là
    biếu không công cụ dò xem địa chỉ nào đã đăng ký — cùng lý do với
    `_authenticate`.
    """
    email = body.email.lower()
    user = await db.scalar(select(User).where(User.email == email))

    # Tài khoản chỉ đăng nhập bằng OAuth không có mật khẩu để mà đặt lại. Vẫn
    # gửi thư, nhưng chỉ ra chỗ họ đăng nhập được — im lặng thì họ ngồi đợi mãi.
    if user is not None and user.password_hash is None and user.oauth_provider:
        background_tasks.add_task(
            send_email,
            email,
            "[PTMatch] Đăng nhập tài khoản của bạn",
            "Chào bạn,\n\n"
            "Tài khoản PTMatch của bạn đăng nhập bằng %s, nên không có mật khẩu "
            "để đặt lại.\n\n"
            "Hãy vào %s/login và bấm nút đăng nhập bằng %s.\n"
            % (user.oauth_provider.capitalize(), settings.frontend_base_url,
               user.oauth_provider.capitalize()),
        )
        return {"status": "accepted"}

    if user is not None:
        token = secrets.token_urlsafe(32)
        r = get_redis()
        await r.set(f"pwreset:{token}", str(user.id), ex=_RESET_TOKEN_TTL)
        link = "%s/reset-password?token=%s" % (settings.frontend_base_url, token)
        background_tasks.add_task(
            send_email,
            email,
            "[PTMatch] Đặt lại mật khẩu",
            "Chào bạn,\n\n"
            "Bấm vào link dưới đây để đặt mật khẩu mới. Link có hiệu lực 30 phút:\n\n"
            "%s\n\n"
            "Nếu bạn không yêu cầu đổi mật khẩu, bỏ qua thư này — mật khẩu hiện "
            "tại vẫn giữ nguyên.\n" % link,
        )

    return {"status": "accepted"}


@router.post("/reset-password", response_model=TokenResponse)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Đặt mật khẩu mới bằng token một lần.

    Token bị tiêu huỷ ngay lúc đọc (GETDEL) nên không dùng lại được — kể cả khi
    ai đó moi được nó từ hộp thư sau này.
    """
    r = get_redis()
    raw = await r.getdel(f"pwreset:{body.token}")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        )

    user = await db.get(User, uuid.UUID(raw if isinstance(raw, str) else raw.decode()))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản không còn tồn tại",
        )

    user.password_hash = hash_password(body.password)
    # Thu hồi mọi access/refresh token cấp TRƯỚC thời điểm này (xem
    # deps.py::token_predates_credentials_change) — nếu không, một kẻ đã trộm
    # refresh token vẫn giữ được phiên tới hết hạn 30 ngày kể cả sau khi chủ
    # tài khoản vừa "khôi phục" bằng cách đặt lại mật khẩu.
    user.credentials_changed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    # Đăng nhập luôn: bắt người vừa đặt mật khẩu gõ lại nó ở màn hình kế tiếp là
    # thêm một chỗ rơi mà không đổi lại được gì về bảo mật.
    return _token_response(user, await _full_name_for(db, user))


def _oauth_error_redirect(message: str) -> RedirectResponse:
    return RedirectResponse(
        f"{settings.frontend_base_url}/login?oauth_error={urllib.parse.quote(message)}"
    )
