"""Fixtures for the API integration tests.

These run against a real PostgreSQL database (`ptmatch_test`, created and
dropped per session and migrated with Alembic) because the schema leans on
Postgres-specific features — JSONB, generated tsvector columns, the
`ptmatch_unaccent` function — that a SQLite stand-in could not reproduce.

Run them inside the dev stack:  docker compose exec backend pytest
"""
import asyncio
import os
import subprocess
from typing import AsyncGenerator
from urllib.parse import urlsplit, urlunsplit

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import get_db
from app.core.ratelimit import limiter
from app.core.redis import close_redis
from app.main import app

TEST_DB_NAME = "ptmatch_test"


def _with_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path="/" + name))


TEST_DATABASE_URL = _with_database(settings.database_url, TEST_DB_NAME)
MAINTENANCE_URL = _with_database(settings.database_url, "postgres")


async def _run_maintenance(*statements: str) -> None:
    engine = create_async_engine(
        MAINTENANCE_URL, isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    try:
        async with engine.connect() as conn:
            for statement in statements:
                await conn.execute(text(statement))
    finally:
        await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def test_database():
    asyncio.run(
        _run_maintenance(
            f"DROP DATABASE IF EXISTS {TEST_DB_NAME} WITH (FORCE)",
            f"CREATE DATABASE {TEST_DB_NAME}",
        )
    )

    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    subprocess.run(
        ["alembic", "upgrade", "head"],
        check=True,
        env=env,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
    )

    # Rate limits are per client IP; every test would share one bucket.
    # They are exercised on purpose in test_api.py::test_rate_limit_blocks_login_flood.
    limiter.enabled = False

    yield

    asyncio.run(_run_maintenance(f"DROP DATABASE IF EXISTS {TEST_DB_NAME} WITH (FORCE)"))


@pytest_asyncio.fixture(autouse=True)
async def _fresh_redis_per_test():
    """Đóng client Redis dùng chung sau mỗi test.

    app.core.redis giữ một client singleton, còn pytest-asyncio tạo event loop
    mới cho từng test. Không dọn thì client (và pool bên dưới) vẫn dính vào loop
    của test đầu tiên, và test sau chạm tới Redis sẽ đổ "attached to a different
    loop" / "Event loop is closed" — lỗi phụ thuộc thứ tự chạy, rất khó lần.
    """
    yield
    await close_redis()


@pytest_asyncio.fixture
async def raw_sql():
    """Run SQL straight against the test DB, to set up states the API forbids."""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)

    async def run(statement: str, **params):
        async with engine.begin() as conn:
            result = await conn.execute(text(statement), params)
            return result.all() if result.returns_rows else None

    try:
        yield run
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http_client:
            yield http_client
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
