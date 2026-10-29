---
name: myusellm
description: 为项目添加与特定项目配置相同的大模型参数（apihub），同时自动在项目中配置生产级多阶段 Dockerfile、Dockerbak.txt、.dockerignore，以及经过实战验证可一次性构建成功的本地/远程一键部署脚本（redeploy.bat / upload2remote.bat）。v2 版本内置依赖锁文件策略与网络抗中断机制。
---

# myusellm — 统一大模型与双部署集成脚本技能（v2）

本技能专为在其他项目中一键配置特定大模型 API 连接，并同时生成**一次运行即可成功构建容器**的 Dockerfile 容器化环境和"本地 + 远程"双环境一键部署脚本而设计。

v2 模板全部经过 Windows + Docker Desktop 实际环境端到端验证（构建、启动、HTTP 200、数据持久化全部通过），并内置了针对以下真实故障的防御：
- npm 在线解析依赖时遭遇 SSL 中断（ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC）
- npm 11 生成的锁文件被 npm ci 拒绝（ajv 新旧版本 peer 冲突）
- syntax 前端镜像拉取失败（镜像加速源返回 EOF）
- --network=host 在 Docker Desktop (Windows) 不受支持
- LF 换行的 .bat 文件被 cmd.exe 解析错乱

## 适用场景与触发词
当用户提及以下需求时，应优先触发和执行此技能：
- "添加大模型 myusellm"
- "部署到远程服务器"、"生成部署脚本"
- "配置 Dockerfile 与 2个部署 bat 脚本"
- "使用特定 API 密钥和本地部署"

## 成功标准（必须全部达成才算完成）
1. redeploy.bat 运行后 Docker 镜像构建成功
2. 容器正常启动且状态为 running
3. http://localhost:[端口] 返回 HTTP 200
4. 数据持久化目录（宿主机 D:\docker\[项目名]\data）正常读写

---

## 核心任务流程

调用此技能时，按顺序执行以下任务：

### 任务 0（最关键）：生成依赖锁文件 package-lock.json

在写任何部署文件之前，必须先确保项目根目录存在与 package.json 同步的 package-lock.json：

```bash
npm install --legacy-peer-deps --package-lock-only
```

**为什么必须做**：
- AI Studio 导出的项目通常只有 bun.lock，npm 无法使用。没有锁文件时 Docker 内 npm install 需在线解析全部依赖版本，网络稍差就会产生 ERESOLVE 冲突或 SSL 中断。
- 有了锁文件，Docker 内改用 npm ci（按锁文件精确安装），请求数量与解析不确定性都大幅降低。
- **必须带 --legacy-peer-deps**：@modelcontextprotocol/sdk 的可选 peer 依赖（ajv@8）与 eslint 链（ajv@6）并存时，npm 默认策略会生成一棵 npm ci 校验拒绝的锁文件。

**若本机执行时遇到 ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC**：多为本机代理（如 127.0.0.1:7890）转发国内镜像源时 TLS 流被截断。解决：临时绕过代理直连 npmmirror：

```bash
npm install --legacy-peer-deps --package-lock-only --noproxy "*" --fetch-retries=5
```

**若项目依赖变更后重新部署**：同样先执行本任务刷新锁文件，再运行部署脚本。

### 任务 1：统一大模型参数配置
在目标项目中的大模型客户端初始化代码（如 API 代理路由、lib/gemini.ts 或 app/api/generate/route.ts 等）中，默认配置以下参数，无需用户再次提供：
- **API Base URL (端点)**: https://apihub.agnes-ai.com/v1
- **API Key (密钥)**: sk-GUdpKQNIwwJSZQ5mYyrMnuCJBOwSbB73c2N6NcnNfk5LoKyq

*(注意：在写到配置文件或代码中时，如果是在服务器端运行，可直接在此处写入默认，或将其注册在环境变量 .env 中作为默认回退)*。

### 任务 2：检查 next.config.ts 启用 standalone 输出

部署模板依赖 Next.js 的 standalone 产物（运行镜像无需完整 node_modules）。必须确认 next.config.ts 中包含：

```ts
output: 'standalone',
```

若没有则添加。若项目不是 Next.js，此任务跳过，并根据框架调整 Dockerfile 的构建与启动命令。

### 任务 3：生成 Dockerfile 与 Dockerbak.txt

在项目根目录创建生产级多阶段 Dockerfile，模板如下（Node 版本按项目实际调整）：

```dockerfile
############################################################
# 阶段 1：构建阶段 —— 安装依赖并编译 Next.js 生产版本
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
    NPM_CONFIG_FUND=false \
    NEXT_TELEMETRY_DISABLED=1

# 只复制依赖清单，充分利用 Docker 层缓存
COPY package.json package-lock.json ./

# 按锁文件精确安装（不再在线解析依赖版本，避免 ERESOLVE 冲突）
# --legacy-peer-deps：跳过 peer 依赖校验（npm 默认策略在 ajv 等
#   包新旧版本并存时会生成 npm ci 拒绝的锁文件）
# cache mount 缓存已下载的包，即使失败重试也能续传
RUN --mount=type=cache,target=/root/.npm \
    ok=0; \
    for i in 1 2 3; do \
      echo "== npm ci attempt $i =="; \
      npm ci --legacy-peer-deps --no-audit --no-fund --maxsockets=3 && ok=1 && break; \
      sleep 5; \
    done; \
    [ "$ok" = "1" ] || (echo "npm ci failed after 3 attempts" && exit 1)

# 复制源码并构建（next.config.ts 已启用 output: "standalone"）
COPY . .
RUN npm run build

############################################################
# 阶段 2：运行阶段 —— 仅保留运行所需的最小文件集
############################################################
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# 以非 root 用户运行，更安全
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# standalone 产物自带精简 server.js，无需完整 node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 数据目录（宿主机挂载卷会覆盖此目录）
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

**严格禁止与注意事项**：
- **禁止在 Dockerfile 第一行添加 syntax 前端指令**（即以 # 开头、冒号分隔 dockerfile:1 的那行指令）！该指令会让 BuildKit 每次构建都额外拉取 docker/dockerfile 前端镜像，镜像加速源（腾讯云/中科大/163）不稳时直接 EOF 构建失败。模板所用特性（多阶段、RUN --mount、COPY --chown）Docker Desktop 内置前端均原生支持。
- 若项目存在 public/ 目录，必须在 runner 阶段增加：`COPY --from=builder --chown=nextjs:nodejs /app/public ./public`
- 若项目使用 better-sqlite3 等需要源码编译的原生模块，builder 阶段需在 npm ci 前添加：`RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*`
- 同时在项目根目录额外生成一份命名为 Dockerbak.txt 的文件，**其内容与上述 Dockerfile 必须完全一致**。

### 任务 4：生成本地部署脚本 redeploy.bat

在项目根目录生成 redeploy.bat（模板见下）。[项目名] 从 package.json 的 name 字段获取；[端口] 优先沿用项目中已有脚本的端口，否则询问用户（同机多项目时端口必须唯一，参考值 7862）。

```batch
@echo off
setlocal EnableExtensions

echo ========================================
echo  [项目名] - Docker Deployment Script (Windows)
echo ========================================
echo.

:: ================= CONFIG =================
set "IMAGE_NAME=[项目名]"
set "CONTAINER_NAME=[项目名]"
set "HOST_PORT=[端口]"
set "CONTAINER_PORT=3000"
set "DATA_DIR=D:\docker\[项目名]\data"
:: ==========================================

:: [0/5] Check Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not running. Please start it first.
    pause
    exit /b 1
)

:: [1/5] Check lock file (required by npm ci)
if not exist "package-lock.json" (
    echo [ERROR] package-lock.json not found.
    echo Please run: npm install --legacy-peer-deps --package-lock-only
    pause
    exit /b 1
)

echo [1/5] Building Docker image '%IMAGE_NAME%:latest' ...
echo       ^(dependencies install from lock file, with cache + auto-retry^)
docker build -t %IMAGE_NAME%:latest .
if errorlevel 1 (
    echo.
    echo [WARNING] Build failed once. Retrying in 10s ...
    ping -n 11 127.0.0.1 >nul
    docker build -t %IMAGE_NAME%:latest .
)
if errorlevel 1 (
    echo.
    echo [ERROR] Docker build failed. Deployment aborted.
    echo Please check network / proxy settings, then run again.
    pause
    exit /b 1
)
echo Build successful.
echo.

echo [2/5] Stopping and removing old container...
docker rm -f %CONTAINER_NAME% >nul 2>&1
echo Done.
echo.

echo [3/5] Cleaning up dangling images...
for /f "tokens=*" %%i in ('docker images %IMAGE_NAME% -q --filter "dangling=true" 2^>nul') do docker rmi %%i >nul 2>&1
echo Done.
echo.

echo [4/5] Preparing data directory and starting new container...
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

docker run -d --name %CONTAINER_NAME% ^
    -p %HOST_PORT%:%CONTAINER_PORT% ^
    -v "%DATA_DIR%:/app/data" ^
    --restart unless-stopped ^
    %IMAGE_NAME%:latest
if errorlevel 1 (
    echo [ERROR] Failed to start Docker container.
    pause
    exit /b 1
)

echo.
echo [5/5] Verifying container status...
ping -n 6 127.0.0.1 >nul
set "RUNNING="
for /f "tokens=*" %%i in ('docker inspect -f "{{.State.Running}}" %CONTAINER_NAME% 2^>nul') do set "RUNNING=%%i"
if not "%RUNNING%"=="true" (
    echo [ERROR] Container is NOT running. Recent logs:
    docker logs --tail 30 %CONTAINER_NAME%
    pause
    exit /b 1
)
docker ps --filter "name=%CONTAINER_NAME%" --format "{{.Names}}  {{.Status}}  {{.Ports}}"

echo [INFO] Checking HTTP response on port %HOST_PORT% ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%HOST_PORT%' -UseBasicParsing -TimeoutSec 20; Write-Host ('HTTP ' + $r.StatusCode + ' OK') } catch { Write-Host ('HTTP check failed: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 (
    echo [WARNING] HTTP check failed. Recent logs:
    docker logs --tail 30 %CONTAINER_NAME%
    pause
    exit /b 1
)

echo.
echo [INFO] Recent application logs:
docker logs --tail 10 %CONTAINER_NAME%
echo.
echo ========================================
echo  Deployment Successful!
echo ========================================
echo  Access URL: http://localhost:%HOST_PORT%
echo  Data Dir  : %DATA_DIR%
echo ========================================
echo.
pause
```

### 任务 5：生成远程部署脚本 upload2remote.bat

在项目根目录生成 upload2remote.bat。镜像本地构建后导出 tar，经 scp 上传至目标 Linux 服务器 172.29.173.42（用户 gpzx，密码 9520111），远程加载并运行：

```batch
@echo off
echo ========================================================
echo   Deploying %IMAGE_NAME% to Remote Server
echo ========================================================
echo.

REM ====== CONFIGURABLE VARIABLES ======
set IMAGE_NAME=[项目名]
set CONTAINER_NAME=[项目名]
set CONTAINER_PORT=[端口]
set INTERNAL_PORT=3000
set VOLUME_MOUNT=-v "/bak/docker/[项目名]/data:/app/data"

set TAR_DIR=d:\temp\tar
set TAR_FILE=%TAR_DIR%\%IMAGE_NAME%.tar

set REMOTE_USER=gpzx
set REMOTE_HOST=172.29.173.42
set REMOTE_PASSWORD=9520111
set REMOTE_TAR_DIR=/bak/tar
set NETWORK_NAME=mynet

echo [Step 1/8] Running MCP Server script if exists...
if exist "skills\my_create_mcp\my_create_mcp.js" (
    node skills\my_create_mcp\my_create_mcp.js
    if errorlevel 1 (
        echo [ERROR] MCP Server generation script failed!
        pause
        exit /b 1
    )
) else (
    echo [INFO] MCP Server generation script not found, skipping.
)
echo.

echo [Step 2/8] Checking local temp directories...
if not exist "%TAR_DIR%" (
    mkdir "%TAR_DIR%"
    echo Created directory: %TAR_DIR%
) else (
    echo Directory already exists: %TAR_DIR%
)
echo.

echo [Step 3/8] Building Docker image locally...
docker build -t %IMAGE_NAME% .
if errorlevel 1 (
    echo [WARNING] Build failed once. Retrying in 10s ...
    ping -n 11 127.0.0.1 >nul
    docker build -t %IMAGE_NAME% .
)
if errorlevel 1 (
    echo [ERROR] Local Docker image build failed!
    pause
    exit /b 1
)
echo [SUCCESS] Docker image built successfully!
echo.

echo [Step 4/8] Saving Docker image to tar file...
docker save -o "%TAR_FILE%" %IMAGE_NAME%
if errorlevel 1 (
    echo [ERROR] Docker image save failed!
    pause
    exit /b 1
)
echo [SUCCESS] Image saved to %TAR_FILE%
echo.

echo [Step 5/8] Uploading image tar to remote server...
echo Uploading to %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_TAR_DIR%/
echo Note: If prompted for password, enter: %REMOTE_PASSWORD%
scp "%TAR_FILE%" %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_TAR_DIR%/
if errorlevel 1 (
    echo [ERROR] SCP upload failed! Please verify OpenSSH client and remote server accessibility.
    pause
    exit /b 1
)
echo [SUCCESS] File uploaded successfully!
echo.

echo [Step 6/8] Loading image on remote server...
ssh %REMOTE_USER%@%REMOTE_HOST% "docker load -i %REMOTE_TAR_DIR%/%IMAGE_NAME%.tar"
if errorlevel 1 (
    echo [ERROR] Remote docker load failed!
    pause
    exit /b 1
)
echo [SUCCESS] Remote docker load succeeded!
echo.

echo [Step 7/8] Preparing remote directories and permissions...
ssh %REMOTE_USER%@%REMOTE_HOST% "mkdir -p /bak/docker/[项目名]/data && chmod -R 777 /bak/docker/[项目名]"
if errorlevel 1 (
    echo [WARNING] Remote directory and file preparation encountered issues. Continuing...
) else (
    echo [SUCCESS] Remote database directory and files prepared successfully!
)
echo.

echo [Step 8/8] Stopping existing container and running new container...
ssh %REMOTE_USER%@%REMOTE_HOST% "docker stop %CONTAINER_NAME% 2>/dev/null || true; docker rm %CONTAINER_NAME% 2>/dev/null || true; docker run -d --name %CONTAINER_NAME% -p %CONTAINER_PORT%:%INTERNAL_PORT% %VOLUME_MOUNT% --network=%NETWORK_NAME% --restart unless-stopped %IMAGE_NAME%"
if errorlevel 1 (
    echo [ERROR] Failed to start remote container!
    pause
    exit /b 1
)
echo [SUCCESS] Remote container started successfully!
echo.

echo [Verification] Waiting 5 seconds to check container status...
ping -n 6 127.0.0.1 >nul
ssh %REMOTE_USER%@%REMOTE_HOST% "docker ps | grep %CONTAINER_NAME%"
echo.

echo ========================================================
echo   Deployment Completed Successfully!
echo ========================================================
echo Image Name   : %IMAGE_NAME%
echo Container    : %CONTAINER_NAME%
echo Access URL   : http://%REMOTE_HOST%:%CONTAINER_PORT%
echo Remote Tar   : %REMOTE_HOST%:%REMOTE_TAR_DIR%/%IMAGE_NAME%.tar
echo.
pause
```

### 任务 6：生成 .dockerignore 配置文件

在项目根目录创建以下内容（排除缓存、依赖、脚本、文档及敏感环境变量，缩小构建上下文）：

```ignore
node_modules
.next
out
dist
build
.git
.gitignore
Dockerfile
Dockerbak.txt
docker-compose*.yml
*.log
*.bat
*.md
bun.lock
.env.example
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env*.local
data/
skills/
metadata.json
tsconfig.tsbuildinfo
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
```

注意：bun.lock、skills/、*.bat、*.md 等与镜像运行无关的文件一并排除，可显著缩小构建上下文；若项目确需某文件进入镜像（如运行时读取 skills/），从排除列表中移除对应条目。

### 任务 7：生成 readme.md

清楚描述该应用的功能、运行及使用方法，并在 Docker 部署章节注明：
- 构建采用多阶段方案，依赖按 package-lock.json 以 npm ci --legacy-peer-deps 精确安装
- 若删除过锁文件，必须先执行 npm install --legacy-peer-deps --package-lock-only 重新生成（必须带 --legacy-peer-deps），再运行部署脚本

### 任务 8：端到端验证（必须实际执行）

生成全部文件后，**必须实际运行验证**，而不是仅生成文件：
1. 将两个 .bat 文件转换为 CRLF 换行（见下方"批处理文件硬性规范"）
2. 执行 docker build -t [项目名]:latest . 确认构建成功
3. 启动容器并确认 docker inspect -f "{{.State.Running}}" [项目名] 返回 true
4. 确认 http://localhost:[端口] 返回 HTTP 200
5. 确认数据目录正常生成数据库文件

任何一步失败都必须修复后重试，直到全部通过。

---

## 关键经验规范（TRICKS & TIPS，血泪教训）

1. **锁文件优先**：永远不要让 Docker 在没有 package-lock.json 的情况下 npm install。任务 0 是一切的前提。
2. **始终 --legacy-peer-deps**：本生态的依赖树（ajv@6/ajv@8 并存）在 npm 默认 peer 策略下会生成 npm ci 拒绝的锁文件。
3. **禁止 Dockerfile 首行的 syntax 前端指令**：会额外拉取 docker/dockerfile 前端镜像，镜像加速源不稳时直接构建失败；所用特性内置前端均支持。
4. **禁止 docker build --network=host**：Docker Desktop (Windows) 不支持，只会白白多跑一轮必失败的构建。
5. **批处理文件硬性规范**：
   - .bat 文件内容**只允许 ASCII 字符**（中文注释在 GBK 代码页下会导致解析错乱）
   - **必须为 CRLF 换行**：LF 换行会让 cmd.exe 把变量拦腰截断（如 %CONTAINER_NAME% 变成 NER_NAME）。生成后必须执行转换：
     ```powershell
     foreach ($f in @('redeploy.bat','upload2remote.bat')) {
       $p = Join-Path (Get-Location) $f
       $c = [IO.File]::ReadAllText($p)
       $c = $c -replace "`r?`n", "`r`n"
       [IO.File]::WriteAllText($p, $c, [Text.UTF8Encoding]::new($false))
     }
     ```
   - 延时用 ping -n [秒数+1] 127.0.0.1 >nul 代替 timeout /t（后者在输入重定向环境下会报错）
6. **挂载目录而非单个数据库文件**：-v .../data:/app/data 目录挂载；**严禁**把挂载目标写成单个 .db 文件（远程 Docker 会在宿主机把它创建成目录，导致启动失败）。
7. **容器状态检查用 docker inspect -f "{{.State.Running}}"**：docker ps 过滤无匹配时仍返回退出码 0，不能用于判断失败。
8. **部署后做 HTTP 健康检查**：用 PowerShell Invoke-WebRequest 确认 200，失败时展示 docker logs。
9. **代理与镜像源冲突**：本机 npm 走代理访问 npmmirror 出现 SSL 解密错误时，加 --noproxy "*" 直连（npmmirror 是国内 CDN，直连更稳）。
10. **端口唯一性**：同机多项目时为每个项目分配唯一宿主端口，生成前检查端口是否已被占用（docker ps 或 netstat -ano | findstr [端口]）。
11. **项目自适应命名**：必须读取 package.json 的 name 字段替换模板中的 [项目名]，避免写死。
12. **远程目录权限**：远程挂载目录必须 mkdir -p 预创建并 chmod -R 777，否则非 root 容器用户无写权限。
13. **Dockerbak.txt 与 Dockerfile 内容必须完全一致**。
14. **统一全部页面和信息使用中文显示**：与应用相关的代码及页面展示必须始终保持一致，完美翻译及本土化（但 .bat 脚本本身除外，见第 5 条）。
