# Docker 版：Linux 服务器与 NAS

适合希望隧道持续运行的服务器和 NAS。安装前需要 Docker Engine、Docker Compose 和 Git，并确认可以访问 Cloudflare 网络。

## 架构与支持范围

仓库使用 Node Alpine 和 cloudflared 基础镜像构建。amd64/arm64 能否安装，取决于**所选基础镜像及加速站是否提供对应架构**。已有 ARM fnOS 用户运行反馈，但 v1.8.1 桌面 CI **不等于 ARM Docker 完整验收**。32 位 ARM 未验证。

## 安装

```bash
git clone https://github.com/lieren2012/cloudflare-tunnel-manager.git
cd cloudflare-tunnel-manager
docker compose up -d --build
```

也可在预定安装父目录执行脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/lieren2012/cloudflare-tunnel-manager/main/install.sh | bash
```

脚本会测速选择**代码拉取源**；不自动安装 Docker/Git，也不对 Docker 镜像下载速度进行完整测速。基础镜像仍按 Compose 的配置拉取。第三方加速站可能失效，[切换镜像源](/guide/update#不同下载源不要混用)。

::: tip 安装目录
记录最终项目目录，后续始终在同一个目录升级。不要在旧项目里再克隆出一个同名子目录，否则新容器可能挂载新的空 data。
:::

## 访问与验收

```bash
docker compose ps
curl -fsS http://127.0.0.1:19090/api/auth/state
```

容器应运行，接口应返回 `success: true`。新数据目录返回 `needsSetup: true`；已有账号则为 false。浏览器打开 `http://服务器局域网IP:19090`。

| 默认端口 | 用途 |
| --- | --- |
| 19090 | Web 面板 |
| 19092 | 外部 API，需 API Key |
| 19093 | MCP，需 API Key |

默认 host 网络主要面向 Linux；Docker Desktop 的网络行为不同，不建议直接照搬到 Windows/macOS，优先使用桌面版。端口冲突需要在 Compose 的 `environment` 中显式设置 WEB_PORT/API_PORT/MCP_PORT；仅在 `.env` 写入未被 Compose 引用的变量不会生效。

## 数据与备份

默认 `./data:/data` 保存账号、配置、会话和隧道。升级前备份整个目录，同时保存 `.env` 和 `docker-compose.override.yml`。备份含敏感凭据，不要公开上传。

```bash
# 在实际项目目录执行；停服务使备份一致
docker compose stop
cp -a data "data.backup.$(date +%Y%m%d-%H%M%S)"
docker compose start
```

如果忘记目录：

```bash
docker inspect cf-tunnel-manager --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

以 `/app` 和 `/data` 的宿主机挂载源为准。更新不会主动删除 data，但错误挂载、手动删除或磁盘问题仍可能造成数据不可用。

## 升级与卸载

升级见 [更新教程](/guide/update)。在实际项目目录执行 `bash uninstall.sh`，确认后删除容器，默认保留 data。它不是卸载 Docker，不会删除 Cloudflare 云端隧道和 DNS。若要停用云端隧道，另在面板/Cloudflare 后台处理。
