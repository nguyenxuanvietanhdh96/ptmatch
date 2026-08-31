.PHONY: dev-init dev up down logs seed migrate test build-prod

# ./media là BIND MOUNT dùng chung dev/prod. Để Docker tự tạo thì thư mục thuộc
# root, còn container chạy uid 1000 (appuser, backend/Dockerfile) -> upload ảnh
# lỗi permission. Tạo trước bằng user hiện tại là xong.
dev-init:
	@mkdir -p media

dev: dev-init ## Chạy full stack dev (build + up)
	docker compose up --build

up: dev-init
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

# `docker compose build` trên máy dev sẽ build target `dev` (do override), nên
# muốn thử ảnh production tại chỗ thì gọi docker build trực tiếp — giống hệt
# cách cloudbuild.yaml làm.
build-prod: ## Build thử ảnh production tại máy (CI mới là nơi build thật)
	docker build -t ptmatch-backend:latest ./backend
	docker build --target runner -t ptmatch-frontend:latest ./frontend
