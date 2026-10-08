# v1.8.2 实际验证记录

核对日期：**2026-10-07**。版本：**v1.8.2**，发行代码提交：`6241e35`。本页区分测试结果和未验证范围。

## 可复核的证据

- [v1.8.2 Release 与四个安装包](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/tag/v1.8.2)
- [三平台成功构建及测试：37453842840](https://github.com/lieren2012/cloudflare-tunnel-manager/actions/runs/37453842840)
- [成功发布：37455691773](https://github.com/lieren2012/cloudflare-tunnel-manager/actions/runs/37455691773)
- [运行资源测试脚本](https://github.com/lieren2012/cloudflare-tunnel-manager/blob/v1.8.2/scripts/test-desktop-runtime.mjs)
- [Windows MSI 解包程序测试脚本](https://github.com/lieren2012/cloudflare-tunnel-manager/blob/v1.8.2/scripts/test-installed-desktop.mjs)

## 已通过的范围

| 检查 | Windows x64 | macOS Apple Silicon | Linux amd64 |
| --- | --- | --- | --- |
| 内置 Node 启动服务 | 通过 | 通过 | 通过 |
| 内置 cloudflared 执行 --version | 通过 | 通过 | 通过 |
| 新目录 needsSetup=true | 通过 | 通过 | 通过 |
| 创建管理员、Cookie 会话 | 通过 | 通过 | 通过 |
| 服务重启后保留账号并登录 | 通过 | 通过 | 通过 |
| 打包 | EXE/MSI 通过 | DMG 通过 | DEB 通过 |
| MSI 解包后的桌面程序启动/注册/重启登录 | 通过 | 不适用 | 不适用 |

Windows 的测试从 MSI 提取程序并启动，不是每个 Windows 系统安装向导、全部界面按钮都已自动化验收。macOS/Linux 运行资源通过不等于 GUI 安装全流程通过。

## 尚未验证

- 真实 Cloudflare Account ID/Token、创建云端隧道、DNS 路由和公网请求端到端。
- 长时间在线、断网恢复、休眠恢复、并发压力、国内线路吞吐。
- 大文件上传、影音播放、WebDAV、SSH/RDP 等不同业务协议。
- Intel Mac、Windows ARM64、Linux ARM/其他发行版。
- ARM Docker 全量验收；用户环境反馈不能替代可复现 CI 结果。
- 所有旧版系统兼容性、桌面开机启动和系统后台常驻。

## 本次用户反馈

2026-10-07，ARM fnOS 的 Docker 部署出现更新地址重复加速前缀、把 Docker 镜像源用于 Git 的错误。用户在**实际 Git 项目目录**还原 origin 为 GitHub 原地址，并清空自定义前缀后反馈恢复。这属于单台环境的更新源修复，**不是**所有 ARM 环境或所有业务功能通过测试。

如果你的环境仍异常，请提交版本、操作系统/架构、可复现步骤和脱敏日志。不要上传 Token、密码、会话 Cookie 或含凭据的 data 备份。
