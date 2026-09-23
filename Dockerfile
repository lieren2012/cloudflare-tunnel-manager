# 多阶段构建：cloudflared 官方镜像 + Node.js 运行时
FROM cloudflare/cloudflared:latest AS cloudflared

FROM node:22-alpine

LABEL org.opencontainers.image.title="CF Tunnel Manager" \
      org.opencontainers.image.description="Cloudflare Tunnel 多隧道管理面板 - 单容器多隧道并行"

RUN apk add --no-cache tini

# cloudflared 二进制（alpine 版，musl 兼容）
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com

COPY src ./src
COPY public ./public

# 数据目录（凭据/配置/日志缓冲持久化）
RUN mkdir -p /data
VOLUME ["/data"]

# Web 面板 / 外部 API / MCP
EXPOSE 19090 19092 19093

ENV WEB_PORT=19090 \
    API_PORT=19092 \
    MCP_PORT=19093 \
    DATA_DIR=/data

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
