FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Cài từ requirements.lock (phiên bản chốt cứng) để ảnh chạy test ở CI và ảnh
# deploy lên prod luôn giống hệt nhau. requirements.txt đi kèm để đọc/so sánh ý
# định, nhưng KHÔNG dùng để cài.
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock

COPY alembic.ini pytest.ini entrypoint.sh ./
COPY alembic ./alembic
COPY app ./app
COPY tests ./tests

RUN chmod +x /app/entrypoint.sh \
    && useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/media \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["./entrypoint.sh"]
