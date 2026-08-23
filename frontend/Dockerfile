# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# ---------- dev (docker-compose dev target) ----------
FROM deps AS dev
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- builder ----------
FROM deps AS builder
WORKDIR /app
COPY . .

# NEXT_PUBLIC_* được Next nhúng vào bundle trình duyệt tại thời điểm BUILD, nên
# đặt chúng ở runtime (compose environment) không có tác dụng. Giá trị lấy từ
# frontend/.env.production — Next tự đọc file đó khi build. Đổi giá trị thì sửa
# file rồi build lại; không cần khai báo ARG cho từng biến.
#
# .dockerignore loại .env và .env.local để secret của backend không lọt vào
# image; .env.production chỉ chứa biến công khai nên được giữ lại.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- runner (production, standalone) ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
