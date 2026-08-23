.PHONY: dev up down logs seed migrate test build-prod

dev: ## Chạy full stack dev (build + up)
	docker compose up --build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f backend frontend

seed: ## Tạo dữ liệu demo
	docker compose exec backend python -m app.seed

migrate: ## Chạy alembic migration
	docker compose exec backend alembic upgrade head

test:
	docker compose exec backend pytest

# docker-compose.prod.yml cố tình không khai báo `build:` (xem ghi chú trong
# file đó), nên build ảnh production phải gọi docker build trực tiếp — giống
# hệt cách cloudbuild.yaml làm.
build-prod: ## Build thử ảnh production tại máy (CI mới là nơi build thật)
	docker build -t ptmatch-backend:latest ./backend
	docker build -t ptmatch-frontend:latest ./frontend
