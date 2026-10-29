############################################################
# 阶段 1：构建阶段 —— 安装依赖并编译生产版本
############################################################
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# npm 走国内镜像 + 大幅增强网络重试，应对下载中断
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_FETCH_RETRIES=8 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=15000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_MAXSOCKETS=3 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

# 只复制依赖清单，充分利用 Docker 层缓存
COPY package.json package-lock.json ./

# 按锁文件精确安装（不再在线解析依赖版本，避免 ERESOLVE 冲突）
# cache mount 缓存已下载的包，即使失败重试也能续传
RUN --mount=type=cache,target=/root/.npm \
    ok=0; \
    for i in 1 2 3; do \
      echo "== npm ci attempt $i =="; \
      npm ci --legacy-peer-deps --no-audit --no-fund --maxsockets=3 && ok=1 && break; \
      sleep 5; \
    done; \
    [ "$ok" = "1" ] || (echo "npm ci failed after 3 attempts" && exit 1)

# 复制源码并构建前端产物
COPY . .
RUN npm run build

############################################################
# 阶段 2：运行阶段 —— 仅保留运行所需的最小文件集
############################################################
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# 以非 root 用户运行，更安全
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs appuser

# 复制生产运行必需文件
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/server ./server
COPY --from=builder --chown=appuser:nodejs /app/server.ts ./server.ts
COPY --from=builder --chown=appuser:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodejs /app/public ./public

# 数据持久化目录（挂载卷映射到此处）
RUN mkdir -p /app/data && chown -R appuser:nodejs /app
USER appuser

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
