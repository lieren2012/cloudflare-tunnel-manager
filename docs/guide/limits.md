# Cloudflare 免费版：限制、来源与使用建议

核对日期：**2026-10-07**。这是 Cloudflare 服务限制，不是本项目给用户设置的收费或额度。实际配置以 Cloudflare 账户后台及当前官方条款为准。

## 正式 Tunnel 与临时 Quick Tunnel

本面板通过 Cloudflare 账户创建**命名隧道**，通常绑定你的域名。免费的 `trycloudflare.com` 临时地址属于 Quick Tunnel，不能把它的限制套用到命名隧道。

| 类型 | 规则 | 官方依据 |
| --- | --- | --- |
| 命名隧道 | 每账户最多 1,000 条 cloudflared 隧道 | [账户限额](https://developers.cloudflare.com/cloudflare-one/account-limits/#cloudflare-tunnel) |
| 命名隧道副本 | 每隧道最多 25 个活跃 cloudflared 副本；不是 25 位访客 | 同上 |
| 私网路由 | 每账户 1,000 条 CIDR + Hostname route，与 Mesh 共享；不是直接说只能配 1,000 个公开子域名 | 同上 |
| Quick Tunnel | 最多 200 个同时处理中请求，超出返回 429 | [Quick Tunnel 限制](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/#limitations) |
| Quick Tunnel | 不支持 SSE、无 uptime 保证，重建后域名变化 | 同上 |

## HTTP 上传与缓存

通过 Cloudflare 公网反向代理域名访问，受域名套餐限制：

| 项目 | Free | Pro | Business | Enterprise |
| --- | --- | --- | --- | --- |
| 单次 HTTP 上传 | 100 MB | 100 MB | 200 MB | 最高 5 GB；更大需额外配置 |
| 单个可缓存文件 | 512 MB | 512 MB | 512 MB | 默认 5 GB，可申请调整 |

来源：[官方上传和缓存大小限制](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/#upload-limits)。域名后台也可能配置更低上传上限。

100 MB 是**一次请求上传体积**，不是每月总流量。应用支持分块上传时，可以将大文件分成多个请求；不能保证所有 NAS/WebDAV 应用默认都支持。512 MB 是**缓存限制**，不能误写成“下载超过 512 MB 一律失败”。超时、业务服务配置和服务条款还会影响实际结果。

## 带宽、视频与网盘

官方 Tunnel 文档没有给出一个适用于所有免费命名隧道的固定 Mbps 或月度 GB 保证，不应宣传为“无限带宽且不限用途”。国内速度受运营商、跨境线路、Cloudflare 边缘和你自己的上行带宽影响，加速镜像下载快不代表隧道访问快。

[官方 Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/#large-file-and-streaming-traffic-through-tunnel) 明确区分：

- 公网域名路由经过反向代理，Free/Pro/Business 分发视频和其他大文件须使用对应的特定付费服务，受 [CDN 服务条款](https://www.cloudflare.com/service-specific-terms-application-services/#content-delivery-network-free-pro-or-business) 约束。
- 私网路由不把应用发布到互联网，上述内容分发限制不适用，但需要 Cloudflare One Client/Mesh/WAN 等相应接入方式。它不是给普通公网用户的下载链接。

NAS 管理面板、普通网站和小请求 API 是常见使用场景；公网影音库播放、网盘大文件分发不能直接当成免费不限量用途。

## Access 与 Tunnel 不同

Tunnel 提供连接；Access 提供访客身份验证。Tunnel 免费不代表 Access、Stream、Load Balancing 等所有附加产品都免费。若启用 Access，应另核对 [Cloudflare One 套餐](https://www.cloudflare.com/plans/zero-trust-services/)，不要将 Access 席位数理解为 Tunnel 公网网站的访客上限。

## 实际使用情况

项目已完成的本地/安装包验证见 [验证记录](/guide/verification)。截至本次核对，**没有**用真实 Cloudflare 凭据完成 v1.8.1 的公网隧道、连续在线压力、国内吞吐或大文件上传测试；不发布虚构测速和“所有功能保证可用”的结论。

本次官方资料来自 [Cloudflare 文档源码仓库](https://github.com/cloudflare/cloudflare-docs)，对应页面见上方链接。官方内容会更新，部署前请再次核对你的套餐与条款。
