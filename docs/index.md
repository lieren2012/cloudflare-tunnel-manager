---
layout: home

hero:
  name: CF Tunnel Manager
  text: Cloudflare Tunnel 多隧道管理面板
  tagline: 单容器内多条隧道同时在线 · Docker 一键部署 · 内置国内网络加速
  image:
    src: /logo.svg
    alt: CF Tunnel Manager
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/
    - theme: alt
      text: 获取 Cloudflare 凭据
      link: /get-credentials
    - theme: alt
      text: GitHub
      link: https://github.com/lieren2012/cloudflare-tunnel-manager

features:
  - icon: 🚇
    title: 多隧道并行
    details: 每条隧道独立进程，可同时在线、独立启停，异常退出按指数退避自动重连（1s → 60s）。原版同时只能连 1 条。
  - icon: 🎲
    title: 一键随机域名
    details: 设定默认域名后，点一下就能生成随机二级域名，并自动在 Cloudflare 创建 DNS CNAME，橙云代理自带 HTTPS。
  - icon: 👥
    title: 多用户与数据隔离
    details: 首个注册者自动成为管理员，后续注册需管理员审核；普通用户只看得到自己的隧道，管理员可加备注。
  - icon: 🔄
    title: 面板内一键更新
    details: 关于页检测更新 → 你手动确认 → 自动拉取代码并重启，登录状态保留。更新源失败会自动切换国内镜像。
  - icon: ⚡
    title: 国内网络加速
    details: 拉代码、拉基础镜像、装 npm 依赖三个环节默认走国内可用源，不用改 daemon.json、不用配代理。
  - icon: 🔌
    title: 外部 API 与 MCP
    details: 自带 RESTful API（19092）与 MCP 服务（19093），可让 AI 客户端直接查询和操控你的隧道。
---

## 它解决什么问题

原版「飞牛 Cloudflare Tunnel」面板同时只能保持 **1 条**隧道在线，想跑多个内网服务就得反复切换。本项目重构为**单容器多隧道架构**——每条隧道是独立子进程，互不影响，可以同时挂载多个内网服务。

## 三分钟跑起来

```bash
# 1. 下载（国内直连不稳就用第二行）
git clone https://github.com/lieren2012/cloudflare-tunnel-manager.git
# git clone https://v4.gh-proxy.org/https://github.com/lieren2012/cloudflare-tunnel-manager.git

# 2. 构建并启动
cd cloudflare-tunnel-manager
docker compose up -d --build
```

然后浏览器打开 `http://你的NAS地址:19090`，按引导注册管理员账户。

接下来的路：**[获取 Cloudflare 凭据](/get-credentials)** → **[填进面板并接入第一条隧道](/guide/)**

## 系统要求

| 项目 | 要求 |
|---|---|
| 系统 | Linux / NAS（飞牛、群晖等），支持 Docker |
| Docker | 支持 `docker compose` 或 `docker-compose` |
| 网络 | 能访问 Cloudflare 边缘（国内正常网络即可） |
| 前置 | 一个已托管到 Cloudflare 的域名（免费套餐就行） |
