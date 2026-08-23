import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.ratelimit import limiter
from app.models import User
from app.schemas.upload import PresignRequest, PresignResponse
from app.services.storage import (
    MAX_UPLOAD_BYTES,
    build_object_key,
    extension_matches_content_type,
    is_allowed_content_type,
    is_safe_key,
    key_belongs_to,
    local_media_path,
    presign_gcs,
)

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("/presign", response_model=PresignResponse)
@limiter.limit("20/minute;100/hour")
async def presign_upload(
    body: PresignRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    if not is_allowed_content_type(body.content_type):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only image/* and video/* uploads are allowed",
        )

    key = build_object_key(str(user.id), body.content_type)
    headers = {"Content-Type": body.content_type}

    if settings.storage_backend == "gcs":
        # presign_gcs chặn (gọi IAM signBlob qua mạng để ký V4). Chạy thẳng ở
        # đây sẽ giữ event loop, làm đứng mọi request đang bay của toàn app.
        signed = await run_in_threadpool(presign_gcs, key, body.content_type)
        return PresignResponse(
            upload_url=signed["upload_url"],
            headers={**headers, "x-goog-content-length-range": signed["x-goog-content-length-range"]},
            public_url=signed["public_url"],
        )

    base_url = str(request.base_url).rstrip("/")
    return PresignResponse(
        upload_url="%s/api/upload/local/%s" % (base_url, key),
        headers=headers,
        public_url="%s/media/%s" % (base_url, key),
        requires_auth=True,
    )


@router.put("/local/{key:path}")
@limiter.limit("20/minute;100/hour")
async def upload_local(
    key: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Local storage is disabled")
    if not is_safe_key(key):
        raise HTTPException(status_code=400, detail="Invalid object key")
    # The GCS path signs a URL scoped to one key; the local path has no such
    # binding, so authorise the prefix explicitly.
    if not key_belongs_to(key, str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot upload outside your own prefix",
        )

    content_type = request.headers.get("content-type", "")
    if not is_allowed_content_type(content_type):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only image/* and video/* uploads are allowed",
        )
    # `key` đến từ URL, không nhất thiết là key mà /presign vừa sinh (endpoint
    # này không giữ trạng thái buộc PUT phải theo sau một presign) — bắt buộc
    # đuôi khớp đúng content-type đã duyệt ở trên, không tin đuôi trong key.
    if not extension_matches_content_type(key, content_type):
        raise HTTPException(status_code=400, detail="Object key extension does not match content type")

    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10MB limit",
        )

    size = 0
    chunks = []
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File exceeds 10MB limit",
            )
        chunks.append(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty body")

    try:
        path = local_media_path(key)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid object key")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        for chunk in chunks:
            f.write(chunk)

    base_url = str(request.base_url).rstrip("/")
    return {"status": "ok", "public_url": "%s/media/%s" % (base_url, key)}
