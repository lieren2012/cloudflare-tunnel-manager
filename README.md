# CF Tunnel Manager

当前版本：**v1.8.1**。提供 `install.sh` 一键安装/升级与 `uninstall.sh` 卸载脚本。

发布新版本时运行 `npm run version:set -- 1.8.0`，会同步更新 Docker、Tauri 和文档中的版本号。

参考「飞牛 Cloudflare Tunnel (NasPK)」重构的 **Cloudflare Tunnel 多隧道管理面板**。

> 核心增强：**单容器支持多条隧道同时在线**（原版同时只能连 1 条），互不影响、独立启停、异常自动重连。

📖 **在线文档：<https://lieren2012.github.io/cloudflare-tunnel-manager/>** —— 部署、使用、更新、安全，全在里面。

第一次用先看：**[获取 Cloudflare 凭据（3 步，1 分钟）](docs/get-credentials.md)** → **[快速开始](https://lieren2012.github.io/cloudflare-tunnel-manager/guide/)**

## 功能

| 页面 | 说明 |
|---|---|
| 首页 | 在线隧道数 / 总数 / 边缘连接数 / 运行时长，隧道卡片一览 |
| 系统配置 | **站点名称自定义** + **禁止搜索引擎收录**、Cloudflare Account ID + API Token（测试连接后保存）、连接协议（QUIC/HTTP2）、边缘 IP 版本（IPv4/IPv6）、**默认域名**（用于一键生成随机子域名） |
| Tunnel 列表 | 创建/删除/连接/断开（**支持多隧道并行在线**）、自启开关、域名转发规则（自动创建 DNS CNAME，**🎲 一键随机子域名**） |
| API 凭证 | 外部应用接入凭证管理 |
| 运行日志 | 各隧道实时日志，关键字过滤 + 自动刷新 |
| 用户管理 | 多用户系统（仅管理员可见）：审核注册、禁用/启用、删除、重置密码、注册开关、备注 |
| 关于 | 项目信息（版本/提交/运行环境/目录/仓库链接）+ **版本更新**（检测更新 → 手动确认一键更新）、更新源设置 |

## 站点名称与防搜索引擎收录

面板默认显示 **Cloudflare Tunnel 管理面板**，如果你把面板放到了公网，建议在「**系统配置 → 站点设置**」里做两件事：

1. **改成自定义站点名**：不暴露业务特征（如 `home-panel`、`nas`、`tunnel`），降低被扫描器/搜索引擎按关键词命中的概率。改完立即生效（浏览器标签页、侧边栏、登录页同步更新）。
2. **保持「禁止搜索引擎收录」开启**（默认开启）：
   - `GET /robots.txt` 返回 `User-agent: * / Disallow: /`，全站禁止抓取
   - 所有响应带 `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate` 响应头（比 robots.txt 更硬：即便被抓取也不会建索引、不留快照）
   - 页面 `<head>` 内有 `<meta name="robots" content="noindex,...">`
   - 同时设置 `referrer: no-referrer`，避免从本面板点出去时泄露地址

> ⚠️ 这只是**降低曝光**，不等于访问控制。真正防入侵请配合：Cloudflare Access（Zero Trust 登录）、强密码 / 关闭开放注册、尽量不用可猜测的域名。搜索引擎通常也不会收录“没有任何外链指向”的地址，所以**不要在公开场合贴出面板链接**同样重要。

## 用户系统

- **首次启动**：打开面板会引导你**注册管理员账户**（第一个注册的用户自动成为管理员）
- **开放注册**：之后任何人可通过登录页注册，但**需管理员在「用户管理」中审核通过**才能登录
- **权限**：管理员可管理用户与 API 凭证；普通用户可查看/操作隧道
- **紧急通道**：若忘记管理员密码，可用环境变量 `ADMIN_PASSWORD` 设置的管理密码登录（用户名填 `master` 或留空），进入后重置任意用户密码
- 密码使用 scrypt 加盐哈希存储，会话有效期 7 天

| 端口 | 服务 |
|---|---|
| 19090 | Web 管理面板 |
| 19092 | 外部 RESTful API（`X-API-Key` 鉴权） |
| 19093 | MCP 服务（Streamable HTTP，`X-API-Key` 鉴权） |

## 部署（Docker，推荐 NAS）

### 一键安装 / 升级（v1.8.0）

脚本会对 GitHub 直连和内置加速源测速，自动选择可用且最快的源，然后拉取代码、构建并启动容器，最后输出面板 IP 和端口。脚本会优先复用当前目录或 `$HOME/cloudflare-tunnel-manager` 中的已有安装，并在升级前备份 `data/`，因此不会清空已有账号、隧道和凭据：

```bash
curl -fsSL https://raw.githubusercontent.com/lieren2012/cloudflare-tunnel-manager/main/install.sh | bash
```

已有目录也可直接执行：

```bash
bash install.sh
```

卸载容器并保留配置数据：

```bash
bash uninstall.sh
```

如需连数据一起删除，请在确认备份后手动删除项目目录下的 `data/`。

```bash
# 1. 下载项目（国内直连不稳时，把网址换成下面第二行）
git clone https://github.com/lieren2012/cloudflare-tunnel-manager.git
# git clone https://v4.gh-proxy.org/https://github.com/lieren2012/cloudflare-tunnel-manager.git

# 2. 构建并启动
cd cloudflare-tunnel-manager
docker compose up -d --build
```

- 默认使用 `network_mode: host`，cloudflared 可直接访问宿主机内网服务
- 不想用 host 网络时改用 `ports` 映射，隧道服务地址填宿主机 IP
- 数据（凭据/配置/凭证/会话）持久化在 `./data/`
- 挂载 `./:/app`（compose 已内置）→ 启用面板内一键更新；删掉该挂载则只能用命令行更新
- `restart: unless-stopped`（compose 已内置）→ 面板内更新后容器能自动拉起
- 设置环境变量 `ADMIN_PASSWORD` 可开启面板登录（默认关闭，建议仅内网使用）

## 国内网络加速（已内置，通常无需配置）

三个环节都默认走国内可用源，**不用改 `daemon.json`、不用配代理**：

| 环节 | 默认 | 失败兜底 |
|---|---|---|
| 拉取/更新代码 | 直连 GitHub | 自动依次切 `v4.gh-proxy.org` → `gh-proxy.com` → `ghfast.top`，成功的会记住 |
| 拉取基础镜像 | `docker.1ms.run` | `bash update.sh` 构建失败时自动改用官方源重试 |
| 安装 npm 依赖 | `registry.npmmirror.com` | — |

需要换源时，在项目目录建一个 `.env` 文件（`cp .env.example .env`）即可覆盖：

```ini
# 基础镜像换回官方 / 换其他加速站
NODE_IMAGE=node:22-alpine
CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest
# NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
```

也可以用命令临时覆盖：

```bash
NODE_IMAGE=node:22-alpine CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest docker compose up -d --build
```

> 若你已给 Docker 配了全局镜像加速（`/etc/docker/daemon.json` 里的 `registry-mirrors`），本项目显式写了镜像地址，两者不冲突。

## 更新

### 方式一：面板内一键更新（推荐）

管理员登录 → 左侧「**ℹ️ 关于**」→「**版本更新**」：

1. 点「🔍 检测更新」——面板会连接更新源比对版本，列出**落后的提交**与最新版本号
2. 有新版时出现「⬆️ 更新到最新版」，**点一下并确认**即可（不会自动升级，必须你手动确认）
3. 更新后面板**自动重启**加载新版本，页面会自动刷新（登录状态保留）

侧边栏「关于」出现 🔴 红点、首页出现提示条，即表示检测到新版本。

**工作原理**：项目源码以卷的方式挂载进容器（compose 中 `./:/app`），更新 = `git fetch` + `git reset --hard` 到最新提交，随后容器重启加载新代码。`./data/` 不在 git 中，**凭据、用户、隧道配置完全不受影响**。

> ⚠️ **首次启用需要手动更新一次**：旧版本容器内没有源码挂载与新镜像，需先执行一次下面「方式二」，之后就能一直在面板里更新了。
>
> **更新源自动切换（默认内置，无需配置）**：检测更新时先直连 GitHub（25 秒快速失败），失败后自动依次尝试内置镜像 `v4.gh-proxy.org` → `gh-proxy.com` → `ghfast.top`，成功的镜像会被记住，下次优先使用。所有 git 网络操作均以 HTTP/1.1 发起，可规避国内常见的 `HTTP/2 stream was not closed cleanly` 报错。也可在「关于」页的「更新源设置」里**固定指定**某个镜像（下拉选择或自定义加速前缀），或填 **Git 代理**（如 `http://1.8.0.2:7890`）。
>
> 更新记录了回退信息：若新版启动异常，可在 NAS 上 `git reset --hard <更新前的提交>` 后重建容器（更新日志里能看到该提交号）。

### 方式二：命令更新（首次 / 面板更新失败时用）

在项目目录执行，自动检查新版本 → 拉取 → 重建：

```bash
bash update.sh
```

脚本会**先直连 GitHub，失败自动依次切换内置镜像**（`v4.gh-proxy.org` → `gh-proxy.com` → `ghfast.top`），全部走 HTTP/1.1，无需你操心网络问题。

或者直接用命令（效果相同）：

```bash
cd cloudflare-tunnel-manager && git -c http.version=HTTP/1.1 fetch origin && git reset --hard origin/main && docker compose up -d --build && docker image prune -f
```

**直连报 `HTTP/2 stream 1 was not closed cleanly` 或 `Failed to connect to github.com`** → 用镜像版本：

```bash
cd cloudflare-tunnel-manager && git -c http.version=HTTP/1.1 fetch https://v4.gh-proxy.org/https://github.com/lieren2012/cloudflare-tunnel-manager.git main && git reset --hard FETCH_HEAD && docker compose up -d --build && docker image prune -f
```

### 只检查不更新

```bash
cd cloudflare-tunnel-manager && git -c http.version=HTTP/1.1 fetch origin -q && git log --oneline HEAD..origin/main
```

- 有输出 = 有新版本（列出的就是待更新提交）
- 无输出 = 已是最新

> `git reset --hard` 只重置代码文件，`./data/` 里的凭据、用户、隧道配置不受影响（它不在 git 里）。
> 更新完浏览器按 `Ctrl + F5` 强刷，确保加载到新的前端页面。
> 面板内更新会以容器用户（root）在你的项目目录里写 git 数据，宿主机上再操作 git 若提示 `dubious ownership`，执行 `git config --global --add safe.directory <项目路径>` 即可。

## 前置准备（1 分钟）

只需要两样东西：**Account ID** + **一个 API Token**。👉 **详细图文步骤：[获取 Cloudflare 凭据（3 步）](docs/get-credentials.md)**

1. **Account ID**：登录 <https://dash.cloudflare.com> → 右侧栏「账户 ID」复制（32 位字符）
2. **API Token**：<https://dash.cloudflare.com/profile/api-tokens> → 创建令牌 → 创建自定义令牌 → 只加两条权限：
   - 账户 · **Cloudflare Tunnel** · 编辑
   - 区域 · **DNS** · 编辑
   - 区域资源选你的域名 → 创建 → 复制令牌（只显示一次）
3. 面板「系统配置」填入 → 「测试配置」通过 → 「保存配置」

> 面板「系统配置」页内也有同样的折叠说明，不用来回翻文档。

## 使用

1. 「Tunnel 列表」→ 新建 Tunnel（输入名称即可）
2. 点击「连接」——多条隧道可以逐条连接，同时在线
3. 点击「路由」→ 添加规则：`nas.example.com` → `http://1.8.0.10:5000`（自动创建 CNAME）
4. 打开「自启」开关的隧道会在容器重启后自动重连（相当于开机自启）

## 外部 API 示例

```bash
curl -H "X-API-Key: cfm_xxx" http://NAS_IP:19092/api/v1/tunnels
curl -H "X-API-Key: cfm_xxx" -X POST http://NAS_IP:19092/api/v1/tunnels/t_xx/connect
```

## MCP 集成

AI 客户端（如 WorkBuddy）可通过 MCP 接入：

- URL: `http://NAS_IP:19093/mcp`（Streamable HTTP）
- 鉴权：`X-API-Key` 请求头（在「API 凭证」页创建）
- 工具：`list_tunnels` / `create_tunnel` / `delete_tunnel` / `connect_tunnel` / `disconnect_tunnel` / `list_rules` / `add_rule`

## 技术栈

Node.js 22 + Express，前端原生单页（无构建步骤），cloudflared 由 Docker 多阶段构建内置（alpine）。
非 Docker 运行需自行安装 cloudflared（或设 `CLOUDFLARED_PATH`）。

## 文档站（VitePress）

📖 **在线文档：<https://lieren2012.github.io/cloudflare-tunnel-manager/>**（GitHub Pages 托管，可绑自定义域名）

文档源码在 `docs/`，用 VitePress 构建。发布方式有两种：

**方式一：一键发布（当前使用，无需任何额外授权）**

```bash
bash scripts/publish-docs.sh
```

脚本会构建文档站并把产物推送到 `gh-pages` 分支，GitHub Pages 直接从该分支提供页面，约 30~60 秒后生效。内容无变化时会自动跳过，不产生多余提交。

**方式二：推代码自动部署（可选）**

`deploy/github-workflows/docs.yml` 是准备好的自动部署工作流，暂未启用——推送 `.github/workflows/` 下的文件要求令牌具备 `workflow` 权限。想启用：

1. `gh auth refresh -h github.com -s workflow` 补权限
2. `mkdir -p .github/workflows && git mv deploy/github-workflows/docs.yml .github/workflows/docs.yml` 后提交推送
3. 仓库 Settings → Pages → Source 改为 **GitHub Actions**

**本地预览 / 构建**

```bash
npm install
npm run docs:dev      # 本地预览（默认 http://localhost:5173）
npm run docs:build    # 构建到 docs/.vitepress/dist
npm run docs:preview  # 预览构建产物
```

> 部署到 `二级子路径` 时要设置 `DOCS_BASE`（GitHub Pages 项目页为仓库名）：
> `DOCS_BASE=cloudflare-tunnel-manager npm run docs:build`。
> **别写成带前导斜杠的形式**——Git Bash 会把 `/cloudflare-tunnel-manager/` 当路径转换成 Windows 盘符路径，导致产物资源路径全错（配置里已做归一化，但值不带斜杠最稳）。

> 文档站是独立的静态站点，**不参与 Docker 镜像构建**（`vitepress` 在 `devDependencies` 里，镜像安装依赖用 `--omit=dev`）。

## ⚠️ 安全须知

- **默认免登录**：未设置 `ADMIN_PASSWORD` 时面板无认证，**务必只在内网使用**；暴露公网前请务必设置管理密码，并建议用 Nginx/Caddy 反代加 HTTPS
- **降低曝光 ≠ 安全**：自定义站点名 + 禁止收录只能减少被搜索引擎和批量扫描器发现的机会，**不能替代认证**。公网暴露请务必开启 Cloudflare Access 或强密码
- **API 凭证等于管理权限**：`X-API-Key` 泄露 = 他人可完全操控你的隧道与 DNS，请妥善保管、定期轮换
- **凭据本地存储**：Cloudflare API Token 仅加密保存在你自己的 `/data` 目录，项目本身不含任何上报逻辑
- 本项目为个人学习/自用性质的开源工具，**非 Cloudflare 官方项目**，与 Cloudflare, Inc. 无关

## 📄 License

[MIT](LICENSE)
