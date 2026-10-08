---
layout: home
hero:
  name: CF Tunnel Manager
  text: Docker 与桌面端的隧道管理面板
  tagline: v1.8.2 · Windows x64 / macOS Apple Silicon / Linux amd64 · 内置本地运行资源
  image:
    src: /logo.svg
    alt: CF Tunnel Manager
  actions:
    - theme: brand
      text: 选择版本与快速开始
      link: /guide/
    - theme: alt
      text: 下载桌面端
      link: /guide/desktop
    - theme: alt
      text: 免费版限制与实际验证
      link: /guide/limits
features:
  - title: Docker 版
    details: 适合 Linux 服务器和 NAS 持续运行。通过浏览器管理，数据保存在宿主机挂载目录。
  - title: 桌面版
    details: 内置 Node、cloudflared 和生产依赖，无需 Docker。程序启动本地服务后打开管理界面。
  - title: 多隧道管理
    details: 创建隧道、配置域名路由、独立连接与断开，支持多条隧道同时在线。
  - title: 数据留在本机
    details: 用户、凭据和隧道配置持久化到本机。不同设备的数据不会自动同步，升级前请备份。
  - title: 清楚的更新方式
    details: Docker 使用原安装目录升级；桌面端下载新版安装包覆盖安装，不使用 Git 面板更新。
  - title: 来源与测试证据
    details: 公开 Cloudflare 官方限制、安装包架构和 CI 验证范围，不把编译成功等同于公网隧道已验证。
---

## 当前发行版本

**v1.8.2**，资料核对日期：**2026-10-07**。[Release 与下载](https://github.com/lieren2012/cloudflare-tunnel-manager/releases/tag/v1.8.2)。

| 版本 | 使用场景 | 入口 |
| --- | --- | --- |
| Docker | Linux 服务器、NAS，适合长期在线 | [Docker 安装教程](/guide/docker) |
| Windows 桌面 | Windows x64，本机运行服务 | [桌面端安装教程](/guide/desktop) |
| macOS 桌面 | Apple Silicon（M 系列芯片） | [架构与下载](/guide/desktop#下载与适用系统) |
| Linux 桌面 | amd64 的 Debian/Ubuntu 系发行版，deb 包 | [安装与依赖](/guide/desktop#linux) |

当前 Release **没有** macOS Intel、Windows ARM64、Linux ARM 桌面安装包，也没有 v1.8.2 AppImage。ARM NAS 请查看 Docker 教程的架构说明。

## 先确认你的服务在哪台设备

Tunnel 将访问转发到运行 `cloudflared` 的设备可达的服务。桌面端填写 `http://127.0.0.1:8080`，指的是**这台电脑**的 8080 端口；Docker 默认 host 网络下指的是**服务器宿主机**。

本项目负责连接和转发，**不会自动安装或启动你要转发的网站、数据库、NAS 应用或其他业务服务**。请先在本机/局域网打开业务地址，确认服务可用。

开始使用：[选择版本](/guide/) → [获取凭据](/get-credentials) → [创建第一条隧道](/guide/#创建第一条隧道)。
