# CF Tunnel Manager Desktop

Tauri 桌面端内置 Node、cloudflared、服务和生产依赖，安装后无需安装 Docker 或 Node，也无需首次下载运行组件。管理页面从本机服务加载，服务就绪后才显示窗口。

数据持久化到系统用户应用数据目录中的 `com.lieren2012.cf-tunnel-manager/data`，升级不覆盖用户账号和隧道配置。启动日志为同级 `service.log`。

## 开发与构建

```bash
npm install
node scripts/prepare-desktop.mjs
node scripts/download-desktop-runtime.mjs
node scripts/test-desktop-runtime.mjs
npx tauri build --config desktop/src-tauri/tauri.conf.json
```

Windows 安装包还必须通过 MSI 解包后的程序启动、注册、会话和重启账号保留测试。构建附件仅包含安装包；正式 Release 必须在测试通过后发布。

体积以生成的安装包为准，不再使用空桌面壳的体积作为完整客户端的估算。Linux 首先提供 deb；macOS 当前构建 Apple Silicon 版本。
