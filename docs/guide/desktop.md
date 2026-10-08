# 桌面端：安装、使用与升级

当前版本 **v1.8.2**。内置 Tauri 桌面界面、Node、本地管理服务、cloudflared 和生产依赖，**不需要 Docker，也不需要另装 Node**。Windows 界面使用系统 WebView2；系统缺少时，安装器的 bootstrapper 可能需要联网安装它，不能将这种环境宣传为完全离线安装。

## 下载与适用系统

以下大小来自 v1.8.2 Release（2026-10-07 核对，按 MiB 四舍五入，与 GitHub 的显示一致）：

| 系统/架构 | 安装包 | 大小 |
| --- | --- | --- |
| Windows x64 | [EXE](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/download/v1.8.2/CF.Tunnel.Manager_1.8.2_x64-setup.exe) | 38.3 MB |
| Windows x64 | [MSI](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/download/v1.8.2/CF.Tunnel.Manager_1.8.2_x64_en-US.msi) | 54.5 MB |
| macOS Apple Silicon | [DMG](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/download/v1.8.2/CF.Tunnel.Manager_1.8.2_aarch64.dmg) | 57.5 MB |
| Linux amd64 | [DEB](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/download/v1.8.2/CF.Tunnel.Manager_1.8.2_amd64.deb) | 65.2 MB |

没有 v1.8.2 AppImage、Intel Mac、Windows ARM64 或 Linux ARM 桌面包。历史 v1.8.0 的小体积包存在服务启动问题，不应作为当前使用入口。

### Windows

建议 Windows 10/11 x64，普通用户下载 EXE，安装后启动 CF Tunnel Manager。Windows 版本兼容性未逐个验收；不要将 GitHub Windows runner 测试描述成所有 Windows 版本都已实测。MSI 适用于需要该格式的部署场景。

### macOS

确认“关于本机”显示 Apple M 系列芯片，下载 DMG，打开并将应用复制到 Applications。当前构建未配置开发者签名和 notarization；系统可能提示无法验证开发者，需遵循 macOS 的安全策略，不能将它视为已签名安装包。项目配置的最低系统版本不等于每个旧系统版本已通过测试。

### Linux

确认 `uname -m` 为 `x86_64`。在支持 WebKitGTK 4.1 的 Debian/Ubuntu 系发行版安装：

```bash
sudo apt install ./CF.Tunnel.Manager_1.8.2_amd64.deb
```

包管理器可能需要联网安装 GTK/WebKit 依赖。其他发行版、桌面环境和旧版本未逐个测试。需要无图形界面长期运行时，请使用 Docker 版。

## 首次启动

程序启动本地服务，检查 `/api/auth/state` 成功后才打开窗口。

- 新数据目录：显示“创建管理员账户”。
- 已有数据：显示登录；保留原用户名和密码。
- 无法打开窗口：查看下方 service.log，不能靠无限等待解决。

注册面板账户后，按 [快速开始](/guide/#配置-cloudflare) 配置 Cloudflare Token、创建隧道和路由。

## 转发本地服务

例如你的电脑已经运行 `http://127.0.0.1:8080`，把域名路由到这个地址即可；运行服务与桌面端需要在同一台电脑，或填写桌面端可达的局域网 IP。

**桌面端启动的是管理服务和 cloudflared，不会替你启动业务网站。**局域网访问、公网 HTTPS、业务登录均需分别验证。

## 端口和数据目录

桌面版绑定 `127.0.0.1`，Web/API/MCP 端口动态选择，不固定为 19090/19092/19093，也不直接给其他局域网设备提供面板。实际端口见 service.log。Docker 教程里的固定端口命令不能直接套用。

| 系统 | 默认应用目录 |
| --- | --- |
| Windows | `%APPDATA%\com.lieren2012.cf-tunnel-manager` |
| macOS | `~/Library/Application Support/com.lieren2012.cf-tunnel-manager` |
| Linux | `$XDG_DATA_HOME/com.lieren2012.cf-tunnel-manager`，通常为 `~/.local/share/com.lieren2012.cf-tunnel-manager` |

目录下 `data/` 保存账号/隧道/凭据，`service.log` 保存启动日志。Docker data 不会自动导入桌面端；迁移前停止两个实例、备份并核对数据结构，避免同时操作同一配置。

## 升级与卸载

1. 关闭旧应用并备份应用目录中的 data。
2. 从 Release 下载对应系统架构的新包，覆盖安装。
3. 启动后登录原账号，核对隧道与配置。

当前桌面版**没有应用内自动更新器**。面板中的 Git 源码更新机制针对 Docker/源码部署，不能用来升级桌面安装包。卸载桌面程序与删除本地 data、删除 Cloudflare 云端隧道是不同操作；清理数据前先备份。

## 当前边界

电脑休眠、断网和关闭程序可能影响连接；当前不保证系统后台常驻或开机启动。Windows MSI 解包后的启动/注册/重启账号测试已通过；macOS/Linux 通过运行资源测试和打包，尚未完成各平台安装界面全流程验收。完整证据见 [验证记录](/guide/verification)。
