# CF Tunnel Manager

参考「飞牛 Cloudflare Tunnel (NasPK)」重构的 **Cloudflare Tunnel 多隧道管理面板**。

> 核心增强：**单容器支持多条隧道同时在线**（原版同时只能连 1 条），互不影响、独立启停、异常自动重连。

## 功能

| 页面 | 说明 |
|---|---|
| 首页 | 在线隧道数 / 总数 / 边缘连接数 / 运行时长，隧道卡片一览 |
| 系统配置 | Cloudflare Account ID + API Token（测试连接后保存）、连接协议（QUIC/HTTP2）、边缘 IP 版本（IPv4/IPv6） |
| Tunnel 列表 | 创建/删除/连接/断开（**支持多隧道并行在线**）、自启开关、域名转发规则（自动创建 DNS CNAME） |
| API 凭证 | 外部应用接入凭证管理 |
| 运行日志 | 各隧道实时日志，关键字过滤 + 自动刷新 |
| 关于 | 系统信息 |

| 端口 | 服务 |
|---|---|
| 19090 | Web 管理面板 |
| 19092 | 外部 RESTful API（`X-API-Key` 鉴权） |
| 19093 | MCP 服务（Streamable HTTP，`X-API-Key` 鉴权） |

## 部署（Docker，推荐 NAS）

```bash
# 1. 下载项目
git clone https://github.com/lieren-2012/cloudflare-tunnel-manager.git

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
