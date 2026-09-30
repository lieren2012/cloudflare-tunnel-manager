# 快速开始

从零到一条隧道跑通，大约 3 分钟。需要你手上有 **一个托管在 Cloudflare 的域名**（免费套餐足够）。

## 第一步：部署

SSH 到你的 NAS 或服务器：

```bash
# 1. 下载项目（国内直连 GitHub 不稳时，用第二行的镜像地址）
git clone https://github.com/lieren2012/cloudflare-tunnel-manager.git
# git clone https://v4.gh-proxy.org/https://github.com/lieren2012/cloudflare-tunnel-manager.git

# 2. 构建并启动
cd cloudflare-tunnel-manager
docker compose up -d --build
```

构建会自动从 `docker.1ms.run` 拉取基础镜像、从 `registry.npmmirror.com` 装 npm 依赖，国内一般 1~3 分钟。

::: tip 首次构建较慢是正常的
主要耗时在拉取 `node:22-alpine` 和 `cloudflare/cloudflared` 两个基础镜像（合计约 100MB）。第二次重建会用缓存，几秒就好。
:::

## 第二步：打开面板

```text
http://你的NAS地址:19090
```

首次打开会引导你**注册管理员账户**——第一个注册的用户自动成为管理员。

::: warning 记住这个密码
管理员密码用于管理用户与凭据。忘了可以在 NAS 上给容器设 `ADMIN_PASSWORD` 环境变量走紧急恢复通道，或用 `master` 作为用户名登录。
:::

## 第三步：填入 Cloudflare 凭据

进入「**⚙️ 系统配置**」页面，需要填两样东西：

| 字段 | 从哪来 |
|---|---|
| 账号 ID（Account ID） | Cloudflare 后台右侧栏复制 |
| API Token | 自建一个自定义令牌，只给两条权限 |

具体步骤见 **[获取 Cloudflare 凭据](/get-credentials)**（3 步，1 分钟）。

填完点「**测试配置**」，显示通过后点「**保存配置**」。

## 第四步：建第一条隧道

1. 进入「**Tunnel 列表**」→ 点「**新建 Tunnel**」，输入一个名字（例如 `nas`）
2. 点这条隧道的「**连接**」——日志出现 `Registered tunnel connection connIndex=0` 就说明通了
3. 点「**路由**」→ 添加规则：

   | 字段 | 示例 |
   |---|---|
   | 域名 | `nas.example.com` |
   | 服务 | `http://192.168.1.10:5000` |

   保存后会自动在 Cloudflare 创建 DNS CNAME 记录，浏览器打开 `https://nas.example.com` 就能访问你的内网服务了。

4. 打开这条隧道的「**自启**」开关，容器重启后会自动重连（相当于开机自启）。

::: tip 想要随机域名？
先在「系统配置 → 默认域名」里填好你的主域名（如 `example.com`），之后在路由弹窗里点「🎲」就能一键生成随机二级域名，不用自己想名字。
:::

## 服务端口

| 端口 | 服务 | 说明 |
|---|---|---|
| **19090** | Web 管理面板 | 你日常用的界面 |
| **19092** | 外部 REST API | 给别的程序调用，`X-API-Key` 鉴权 |
| **19093** | MCP 服务 | 给 AI 客户端接入，`X-API-Key` 鉴权 |

详见 **[外部 API 与 MCP](/guide/api)**。

## 目录与数据

```text
cloudflare-tunnel-manager/
├── src/            后端源码
├── public/         前端源码
├── data/           ★ 你的数据（不在 git 里，更新不受影响）
│   ├── config.json    Cloudflare 凭据、站点设置、更新源
│   ├── tunnels.json   隧道与分组
│   ├── users.json     用户账户
│   └── sessions.json  登录会话
├── docker-compose.yml
└── update.sh       命令行更新脚本
```

::: danger 一定要备份 data/ 目录
所有凭据、用户、隧道配置都在这里。`git reset --hard` 之类的代码更新不会碰它，但你自己手动删目录前请先备份。
:::

## 网络模式说明

默认使用 `network_mode: host`——这样隧道进程能直接访问宿主机内网（例如 `192.168.x.x` 上的服务），无需额外配置。

如果你必须用 bridge 网络，把 compose 里的 `network_mode: host` 换成端口映射，并把隧道服务地址改成**宿主机 IP**：

```yaml
ports:
  - "19090:19090"
  - "19092:19092"
  - "19093:19093"
```

## 不用 Docker 的话

需要 Node.js 18+ 和本机已安装 `cloudflared`（或用 `CLOUDFLARED_PATH` 指定路径）：

```bash
npm install
npm start
```

## 下一步

- **[管理面板](/guide/panel)** —— 隧道管理、设备分组、多用户、站点设置
- **[更新与国内加速](/guide/update)** —— 面板内一键更新怎么用
- **[安全与公网暴露](/guide/security)** —— 准备把面板放到公网前务必看
