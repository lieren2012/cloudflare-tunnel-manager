# CF Tunnel Manager Desktop

轻量桌面端使用 Tauri 2，安装包只包含桌面壳和前端资源；Node 服务与
`cloudflared` 在首次启动时下载到用户数据目录并缓存，避免把运行时塞进安装包。

## 开发环境

需要 Rust、Node.js 和 Tauri CLI：

```bash
npm install
npm run desktop:dev
```

桌面端默认打开 `http://127.0.0.1:19090`。服务使用与 Docker 版相同的 `data/`
目录结构，因此账号、隧道和凭据可以迁移，不会写入安装目录。

## 体积目标

安装包目标为 10–18 MB；首次启动按平台下载并缓存 Node 服务运行时和
`cloudflared`，之后可离线启动。下载失败时桌面端保留错误信息，不会覆盖已有运行时。
