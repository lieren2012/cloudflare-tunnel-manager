# 外部 API 与 MCP

除了网页面板，本项目还暴露两个编程接口，方便把隧道管理能力接进你自己的程序或 AI 客户端。

本文固定端口示例用于 Docker 默认部署。桌面 v1.8.1 的 API/MCP 只监听 `127.0.0.1`，端口动态选择，请从 `service.log` 读取实际端口替换示例；重启后外部客户端配置可能需要修改。当前没有桌面固定端口配置界面。

先在面板「**🔑 API 凭证**」页创建一个凭证，会得到形如 `cfm_xxxxxxxx` 的 Key（**只显示一次，请立即保存**）。

## 外部 REST API（端口 19092）

鉴权用请求头 `X-API-Key`（也支持 `Authorization: Bearer <key>`）。

### 端点一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/tunnels` | 隧道列表（含在线状态、连接数） |
| `POST` | `/api/v1/tunnels` | 创建隧道，body `{ "name": "nas" }` |
| `DELETE` | `/api/v1/tunnels/:id` | 删除隧道（同时清理云端与本地） |
| `POST` | `/api/v1/tunnels/:id/connect` | 连接隧道 |
| `POST` | `/api/v1/tunnels/:id/disconnect` | 断开隧道 |
| `GET` | `/api/v1/tunnels/:id/rules` | 查看转发规则 |
| `POST` | `/api/v1/tunnels/:id/rules` | 添加转发规则，body `{ "hostname": "...", "service": "..." }` |

`id` 可以填内部 ID（`t_xxxx`）或 Cloudflare 隧道 ID，两者都认。

### 示例

```bash
KEY=cfm_你的密钥

# 列出所有隧道
curl -H "X-API-Key: $KEY" http://NAS_IP:19092/api/v1/tunnels

# 连接某条隧道
curl -H "X-API-Key: $KEY" -X POST http://NAS_IP:19092/api/v1/tunnels/t_xxxx/connect

# 加一条域名转发规则（会自动建 DNS CNAME）
curl -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -X POST http://NAS_IP:19092/api/v1/tunnels/t_xxxx/rules \
  -d '{"hostname":"app.example.com","service":"http://192.168.1.10:8080"}'
```

访问 `http://NAS_IP:19092/` 会返回一份端点自述，方便快速确认服务在跑。

返回格式统一是 `{ "success": true, "data": ... }` 或 `{ "success": false, "error": "..." }`。

## MCP 服务（端口 19093）

给支持 MCP 的 AI 客户端（Claude Desktop、Cursor、WorkBuddy 等）接入，用自然语言管理隧道。

- **端点**：`http://NAS_IP:19093/mcp`
- **传输**：Streamable HTTP
- **鉴权**：`X-API-Key` 请求头（同一个凭证 Key）

### 可用工具

| 工具 | 作用 |
|---|---|
| `list_tunnels` | 列出所有隧道及其在线/健康状态 |
| `create_tunnel` | 创建一条新隧道 |
| `delete_tunnel` | 删除隧道（不可恢复） |
| `connect_tunnel` | 上线指定隧道 |
| `disconnect_tunnel` | 断开指定隧道 |
| `list_rules` | 查看隧道的域名转发规则 |
| `add_rule` | 添加转发规则（自动创建 DNS CNAME） |

### 客户端配置示例

多数客户端用 JSON 描述 MCP 服务，形如：

```json
{
  "mcpServers": {
    "cf-tunnel-manager": {
      "type": "http",
      "url": "http://NAS_IP:19093/mcp",
      "headers": { "X-API-Key": "cfm_你的密钥" }
    }
  }
}
```

具体字段名以你所用客户端的文档为准。配好后就可以直接说「列出我的隧道」「把 nas 这条连上」这类指令。

## ⚠️ 凭证等于管理权限

`X-API-Key` 泄露 = 别人可以**完全操控你的隧道和 DNS 记录**（包括指向恶意地址）。请：

- 不要在公开仓库、截图、聊天里贴出 Key
- 每个用途单独建一个凭证，出问题就单独删除、轮换
- **不要把 19092 / 19093 直接暴露到公网**——它们设计给内网或 VPN 内调用
