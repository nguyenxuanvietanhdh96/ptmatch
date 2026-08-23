import logging
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import (
    admin,
    auth,
    favorites,
    feedback,
    leads,
    pts,
    requests,
    reviews,
    upload,
)
from app.core.config import settings
from app.core.ratelimit import limiter
from app.core.redis import close_redis

# App loggers (ptmatch.*) log at INFO so background-task events (e.g. lead
# notifications) are visible under uvicorn's default WARNING root level.
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
_app_logger = logging.getLogger("ptmatch")
_app_logger.setLevel(logging.INFO)
_app_logger.addHandler(_handler)

@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_redis()


app = FastAPI(
    title="PTMatch API",
    description="API cho nền tảng kết nối học viên với Personal Trainer.",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


@api_router.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(pts.router)
api_router.include_router(leads.router)
api_router.include_router(reviews.router)
api_router.include_router(upload.router)
api_router.include_router(feedback.router)
api_router.include_router(favorites.router)
api_router.include_router(requests.router)
api_router.include_router(admin.router)

app.include_router(api_router)

# Serve uploaded media in local-storage mode (dev)
if settings.storage_backend == "local":
    os.makedirs(settings.local_media_dir, exist_ok=True)
    app.mount(
        "/media",
        StaticFiles(directory=settings.local_media_dir),
        name="media",
    )
