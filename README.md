# CF Tunnel Manager

参考「飞牛 Cloudflare Tunnel (NasPK)」重构的 **Cloudflare Tunnel 多隧道管理面板**。

> 核心增强：**单容器支持多条隧道同时在线**（原版同时只能连 1 条），互不影响、独立启停、异常自动重连。

## 功能

| 页面 | 说明 |
|---|---|
| 首页 | 在线隧道数 / 总数 / 边缘连接数 / 运行时长，隧道卡片一览 |
| 系统配置 | Cloudflare Account ID + API Token（测试连接后保存）、连接协议（QUIC/HTTP2）、边缘 IP 版本（IPv4/IPv6）、**默认域名**（用于一键生成随机子域名） |
| Tunnel 列表 | 创建/删除/连接/断开（**支持多隧道并行在线**）、自启开关、域名转发规则（自动创建 DNS CNAME，**🎲 一键随机子域名**） |
| API 凭证 | 外部应用接入凭证管理 |
| 运行日志 | 各隧道实时日志，关键字过滤 + 自动刷新 |
| 用户管理 | 多用户系统（仅管理员可见）：审核注册、禁用/启用、删除、重置密码、注册开关 |
| 关于 | 系统信息 |

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

```bash
# 1. 下载项目
git clone https://github.com/lieren2012/cloudflare-tunnel-manager.git

# 2. 构建并启动
cd cloudflare-tunnel-manager
docker compose up -d --build
```

- 默认使用 `network_mode: host`，cloudflared 可直接访问宿主机内网服务
- 不想用 host 网络时改用 `ports` 映射，隧道服务地址填宿主机 IP
- 数据（凭据/配置/凭证）持久化在 `./data/`
- 设置环境变量 `ADMIN_PASSWORD` 可开启面板登录（默认关闭，建议仅内网使用）

## 前置准备

1. 一个已托管到 Cloudflare 的域名
2. Cloudflare 自定义 API Token，最小权限：
   - **Cloudflare Tunnel**：读取 + 编辑
   - **DNS**：读取 + 编辑（注意不是「DNS 设置」）
3. 在「系统配置」页填入 Account ID 与 Token → 测试 → 保存

## 使用

1. 「Tunnel 列表」→ 新建 Tunnel（输入名称即可）
2. 点击「连接」——多条隧道可以逐条连接，同时在线
3. 点击「路由」→ 添加规则：`nas.example.com` → `http://192.168.1.10:5000`（自动创建 CNAME）
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

## ⚠️ 安全须知

- **默认免登录**：未设置 `ADMIN_PASSWORD` 时面板无认证，**务必只在内网使用**；暴露公网前请务必设置管理密码，并建议用 Nginx/Caddy 反代加 HTTPS
- **API 凭证等于管理权限**：`X-API-Key` 泄露 = 他人可完全操控你的隧道与 DNS，请妥善保管、定期轮换
- **凭据本地存储**：Cloudflare API Token 仅加密保存在你自己的 `/data` 目录，项目本身不含任何上报逻辑
- 本项目为个人学习/自用性质的开源工具，**非 Cloudflare 官方项目**，与 Cloudflare, Inc. 无关

## 📄 License

[MIT](LICENSE)
