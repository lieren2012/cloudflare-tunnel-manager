# 更新、备份与国内下载源

最新正式发行版见 [Releases](https://github.com/lieren2012/cloudflare-tunnel-manager/releases)。当前为 **v1.8.1**。`main` 可能包含尚未发布的源码改动，不保证与已测试安装包完全一致。

## 桌面端更新

关闭应用，备份用户应用目录里的 data，再下载对应架构的新版包覆盖安装。当前不支持桌面自动更新，不使用关于页的 Git 源码更新。安装包里的 Node/cloudflared 会随新包更新。详见 [桌面教程](/guide/desktop)。

## Docker 命令升级

**进入原来的 Git 项目目录**，不要重新克隆到新目录。先备份 data、`.env` 和 Compose override。

```bash
# 在原项目目录执行，更新到已发布的 v1.8.1
cp -a data "data.backup.$(date +%Y%m%d-%H%M%S)"
git remote set-url origin https://github.com/lieren2012/cloudflare-tunnel-manager.git
git -c http.version=HTTP/1.1 fetch origin tag v1.8.1
git reset --hard v1.8.1
docker compose up -d --build
curl -fsS http://127.0.0.1:19090/api/auth/state
```

`reset --hard` 会覆盖已跟踪源码改动，data/.env 通常被 Git 忽略；**请仍先备份**。有自定义配置时优先放在 `.env` 和 Compose override 中。

也可在旧项目目录执行 `bash install.sh`：复用当前目录、备份 data、拉取 main 并重建。`bash update.sh` 为源码升级脚本，同样跟踪 main；它与固定 Release 升级不同，也不能代替桌面安装器。

对停服务一致性有要求的备份，请按 [Docker 备份教程](/guide/docker#数据与备份) 操作。

## Docker 面板内更新

需要实际 Git 工作区、可运行的 git、Compose 中源码挂载 `./:/app`，以及重启策略 `unless-stopped`。管理员在“关于”页检测更新、确认更新。它会拉取跟踪分支源码并重启进程，**不负责重新安装 Docker 基础镜像或补充新依赖**；依赖变化时仍需命令行重建。

不满足这些前提时，不要反复点击更新按钮，改用命令升级。更新完成核对版本、容器状态、原账号与隧道；页面缓存可用 Ctrl+F5 刷新。

## 不同下载源不要混用

| 下载内容 | 地址示例 | 使用位置 |
| --- | --- | --- |
| Git 源码 | github.com；v4.gh-proxy.org 等 GitHub 反代 | Git 更新源 |
| Docker 镜像 | docker.1ms.run；Docker Hub | Compose build args |
| npm 依赖 | registry.npmmirror.com | NPM_REGISTRY |

`docker.1ms.run` **不是 Git 更新源**。第三方加速源不保证一直可用，不能承诺国内固定速度。安装脚本的代码源测速也不代表镜像、npm 或 Tunnel 本身已测速。

基础镜像不可用时可临时使用官方源：

```bash
NODE_IMAGE=node:22-alpine CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest \
  docker compose up -d --build
```

## 修复更新地址重复拼接

如果错误里出现 `加速站/https://另一个加速站/https://github.com/...`，先在实际项目目录执行：

```bash
git remote set-url origin https://github.com/lieren2012/cloudflare-tunnel-manager.git
git remote get-url origin
```

输出应是原始 GitHub 地址。再在面板清空“自定义加速前缀”，选择“自动”，保存并检测。若手动填写前缀，只填 `https://v4.gh-proxy.org/`，不要填完整仓库 URL。

`fatal: not a git repository` 表示目录不对。通过 Docker inspect 查看挂载，再进入包含 `.git` 的目录：

```bash
docker inspect cf-tunnel-manager --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

## 更新后要求重新注册

先不要创建新账号。通常需要排查新实例是否用了空 data、目录是否套了一层、端口是否指向另一个实例。确认旧挂载和备份后恢复，**不要删除当前 data 再凭猜测复制**。目录里的 `users.json` 是面板用户数据，旧教程中寻找 `auth.json` 不适用于这个项目。
