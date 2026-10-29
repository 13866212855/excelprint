# Excel 智能打印系统 (ExcelPrint)

基于大模型 AI 智能排版的 Excel 多工作表一键打印与高保真 PDF 导出 Web 应用。

## 核心功能

1. **多工作表自动识别与解析**：支持拖拽/点击上传 `.xlsx`、`.xls`、`.xlsm` 等格式，自动分 Sheet 结构化解析。
2. **AI 智能排版决策**：针对各 Sheet 的数据列数、行数、内容宽度智能分析最佳纸张方向（A4 纵向/横向）、缩放比例及分页方案。
3. **高保真跨页与自定义页边距**：
   - 跨页自动重复表头
   - 支持四向（上/下/左/右）毫米级自定义页边距
   - 支持显示/隐藏底部居中格式化页码（`工作表 · 第 X 页 / 共 Y 页`）
   - 支持一键将页面配置同步至全部工作表
4. **多工作表合并 PDF 导出**：服务端采用 jsPDF + Unicode `NotoSansCJK` 字体引擎，彻底解决中文乱码，保留各自最佳横纵方向。
5. **后台管理系统**：访问 `/admin`（初始账号密码：admin / admin123），支持大模型参数动态配置、历史提交记录检索与审计日志。

## 本地开发运行

```bash
# 安装依赖
npm install

# 启动本地开发服务（前后端集成模式，运行在端口 3000）
npm run dev

# 编译前端生产静态资源
npm run build
```

---

## Docker 容器化部署

本项目提供了经过实战验证的 Docker 生产级多阶段构建与一键部署脚本，镜像名与容器名均为 `excelprint`，默认映射宿主机对外端口 `7893`。

### 1. 依赖锁文件说明（重要）
- 构建采用生产级多阶段方案，依赖按 `package-lock.json` 以 `npm ci --legacy-peer-deps` 精确安装，避免网络波动及依赖解析版本冲突。
- 若修改过 `package.json` 或删除过锁文件，必须先执行以下命令重新生成锁文件，再运行部署脚本：
  ```bash
  npm install --legacy-peer-deps --package-lock-only
  ```

### 2. Windows 本地一键部署 (`redeploy.bat`)
双击运行项目根目录下的 `redeploy.bat`，脚本将自动完成：
1. 校验 Docker 运行状态与 `package-lock.json` 锁文件
2. 执行带有国内镜像加速与多重重试机制的 Docker 多阶段镜像构建
3. 停止并清理旧容器与虚悬镜像
4. 创建宿主机持久化数据目录 `D:\docker\excelprint\data` 并启动新容器
5. 执行容器状态检查与 HTTP 端口健康检查（HTTP 200）

访问地址：`http://localhost:7893`

### 3. 远程服务器一键部署 (`upload2remote.bat`)
双击运行项目根目录下的 `upload2remote.bat`：
1. 本地完成 Docker 镜像构建并保存为 `d:\temp\tar\excelprint.tar`
2. 经由 SCP 安全传输至远程服务器 `172.29.173.42`（用户 `gpzx`，目录 `/bak/tar/`）
3. 远程服务器自动加载镜像、配置持久化目录 `/bak/docker/excelprint/data` 权限
4. 启动容器并接入 `mynet` 网络，自动重启策略 `unless-stopped`

远程访问地址：`http://172.29.173.42:7893`

### 4. 目录与数据持久化
- 容器内数据目录：`/app/data`
- Windows 本地宿主机目录：`D:\docker\excelprint\data`
- 远程 Linux 宿主机目录：`/bak/docker/excelprint/data`
