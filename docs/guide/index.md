# 选择版本与快速开始

当前正式发行版 **v1.8.2**。安装包、源码及测试范围以 [Release](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/tag/v1.8.2) 和 [实际验证记录](/guide/verification) 为准。

## 选哪个版本

| 条件 | 建议 |
| --- | --- |
| NAS / Linux 服务器需要长期在线 | Docker 版 |
| Windows x64 本地电脑 | Windows EXE；也提供 MSI |
| macOS M 系列芯片 | Apple Silicon DMG |
| Debian/Ubuntu amd64 桌面 | Linux DEB |
| Intel Mac / ARM Linux 桌面 | 当前无对应桌面包；不要下载不匹配的架构 |

Docker 与桌面版共用管理功能，但运行环境、端口、数据目录、升级方式不同。电脑休眠、断网或服务停止会影响隧道访问；需要持续在线优先用服务器或 NAS。

## 安装

- [Docker 安装与卸载](/guide/docker)：需要 Docker、Compose、Git，默认端口 19090。
- [桌面端安装与升级](/guide/desktop)：内置 Node 与 cloudflared，本地端口自动分配。

## 首次注册与已有账号

新数据目录首次打开显示“创建管理员账户”，第一个账户成为管理员。已有数据则显示登录。后续注册用户需管理员审核。

面板账户是本次安装自己的账号，**不是 Cloudflare 账号**。Docker 服务器和本地桌面端各有数据目录，账号不会自动同步。升级后突然要求注册，先检查目录/挂载，不要直接创建新管理员覆盖排查线索。

## 配置 Cloudflare

需要可用于发布域名的 Cloudflare 账户、域名、Account ID 和 API Token。[按凭据教程创建令牌](/get-credentials)，在“系统配置”里测试通过后保存。域名购买费用与 Tunnel 是否免费是两回事。

## 创建第一条隧道

1. 先确认业务服务已启动，可以直接访问，如 `http://127.0.0.1:8080` 或 `http://192.168.1.10:5000`。
2. 打开“Tunnel 列表”，新建隧道，例如 `nas`。
3. 点击“连接”，查看日志是否出现 `Registered tunnel connection`。
4. 添加路由：`nas.example.com` → 业务服务地址。面板会创建对应 DNS CNAME。
5. 从外部网络访问 `https://nas.example.com`，验证页面、登录和实际请求均可用。只有进程在运行不足以证明转发成功。

“自启”表示面板服务启动后自动连接已配置隧道，**不代表桌面程序已实现随操作系统开机启动**。

## 常用教程

- [管理面板](/guide/panel)
- [Docker/桌面不同的更新方式](/guide/update)
- [外部 API 与 MCP：端口区别](/guide/api)
- [免费版限制与用途](/guide/limits)
- [安全、备份与公网访问](/guide/security)
- [排错](/guide/faq)
