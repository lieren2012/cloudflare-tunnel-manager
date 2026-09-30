# 更新与国内加速

## 面板内一键更新（推荐）

管理员登录 → 左侧「**ℹ️ 关于**」→「**版本更新**」：

1. 点「**🔍 检测更新**」——面板连接更新源，比对版本，列出**落后的提交**和最新版本号
2. 有新版时出现「**⬆️ 更新到最新版**」，点一下并确认
3. 面板**自动重启**加载新版本，页面自动刷新，**登录状态保留**

侧边栏「关于」出现红点、首页出现提示条，就表示检测到了新版本。

::: info 更新为什么不会丢数据
项目源码以卷的方式挂载进容器（compose 里的 `./:/app`），更新 = `git fetch` + `git reset --hard` 到最新提交，然后容器重启加载新代码。你的 `./data/` 目录不在 git 里，凭据、用户、隧道配置完全不受影响。
:::

::: warning 第一次必须先手动更新一次
旧版本容器里没有源码挂载、也没有新镜像，**面板内更新按钮在第一次是用不了的**。请先用下面的命令行方式更新到最新版，之后就能一直在面板里点了。
:::

## 命令行更新

### 用脚本（推荐）

在项目目录执行：

```bash
bash update.sh
```

脚本会：**先直连 GitHub，失败自动依次切换内置镜像**（`v4.gh-proxy.org` → `gh-proxy.com` → `ghfast.top`），全部以 HTTP/1.1 发起，最后自动重建容器。

### 直接敲命令

```bash
cd cloudflare-tunnel-manager && \
git -c http.version=HTTP/1.1 fetch origin && \
git reset --hard origin/main && \
docker compose up -d --build && \
docker image prune -f
```

**如果直连报错**（`HTTP/2 stream 1 was not closed cleanly` 或 `Failed to connect to github.com`），换成走镜像：

```bash
cd cloudflare-tunnel-manager && \
git -c http.version=HTTP/1.1 fetch https://v4.gh-proxy.org/https://github.com/lieren2012/cloudflare-tunnel-manager.git main && \
git reset --hard FETCH_HEAD && \
(docker compose up -d --build 2>/dev/null || docker-compose up -d --build)
```

### 只检查不更新

```bash
cd cloudflare-tunnel-manager && git -c http.version=HTTP/1.1 fetch origin -q && git log --oneline HEAD..origin/main
```

- **有输出** = 有新版本（列出的就是待更新的提交）
- **无输出** = 已是最新

## 国内网络加速（已内置，通常无需配置）

三个环节都默认走国内可用源，**不用改 `daemon.json`、不用配代理**：

| 环节 | 默认 | 失败兜底 |
|---|---|---|
| 拉取/更新代码 | 直连 GitHub | 自动依次切 `v4.gh-proxy.org` → `gh-proxy.com` → `ghfast.top`，成功的会**记住**下次优先用 |
| 拉取基础镜像 | `docker.1ms.run` | `bash update.sh` 构建失败时自动改用官方源重试 |
| 安装 npm 依赖 | `registry.npmmirror.com` | — |

### 更新源是怎么选的

点「检测更新」时按这个顺序自动尝试，**一个失败立刻换下一个**：

1. **直连 GitHub**（只给 25 秒快速失败，不会干等）
2. **上次成功的镜像**（记住的）
3. **v4.gh-proxy.org** → **gh-proxy.com** → **ghfast.top**

检测结果会显示「本次检测经 xxx 完成」，让你知道走的哪个源。全部失败时，错误信息会**列出每个源的具体失败原因**。

### 手动指定更新源

一般不用管。如果公司/学校网络有特殊要求，可以在「关于 → 更新源设置」里：

- **更新源下拉**：选「自动」或固定用某个内置镜像
- **自定义加速前缀**：自己有镜像就填这里（**填了就优先于下拉**）
- **Git 代理**：例如 `http://192.168.1.2:7890`

### 换 Docker 基础镜像源

项目在 Dockerfile 里把基础镜像参数化了，所以不用改 Docker 全局配置。需要换源时，在项目目录建 `.env`：

```bash
cp .env.example .env
```

```ini
# 换回官方源
NODE_IMAGE=node:22-alpine
CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest
# 或者换其他加速站
# NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
```

也可以只在某次构建临时覆盖：

```bash
NODE_IMAGE=node:22-alpine CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest docker compose up -d --build
```

::: tip 为什么不用改 daemon.json
Docker 全局镜像加速要写 `/etc/docker/daemon.json` 并重启 Docker 服务——在 NAS 上这会把其他容器一起停掉。本项目改成在镜像名里直接写加速地址，零系统改动、开箱即用。
:::

## 更新出问题怎么回退

更新日志（`data/update.log`）里记录了**更新前的提交号**。如果新版启动异常：

```bash
cd cloudflare-tunnel-manager
git reset --hard <更新前的提交号>
docker compose up -d --build
```

## 常见更新报错

::: details `HTTP/2 stream 1 was not closed cleanly`
国内直连 GitHub 的经典故障，与你的配置无关。用镜像命令更新即可（见上面「直接敲命令」的第二段）。
:::

::: details `dubious ownership in repository`
面板内更新是以容器用户（root）写的 git 数据，宿主机上再操作 git 可能报这个。执行一次：

```bash
git config --global --add safe.directory /www/wwwroot/cf.tunnel/cloudflare-tunnel-manager
```
:::

::: details 更新完了但页面没变化
先 **Ctrl + F5** 强刷浏览器（前端资源有缓存）。如果版本号还是旧的，确认容器真的重建了：

```bash
docker compose ps
docker compose logs --tail=20
```
:::
