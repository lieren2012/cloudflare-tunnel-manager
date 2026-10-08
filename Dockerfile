# 多阶段构建：cloudflared 官方镜像 + Node.js 运行时
#
# 基础镜像默认走国内加速站 docker.1ms.run（免改 daemon.json，开箱可用）。
# 海外环境或加速站临时不可用时，用官方地址覆盖即可：
#   docker compose build --build-arg NODE_IMAGE=node:22-alpine \
#                        --build-arg CLOUDFLARED_IMAGE=cloudflare/cloudflared:latest
ARG NODE_IMAGE=docker.1ms.run/library/node:22-alpine
ARG CLOUDFLARED_IMAGE=docker.1ms.run/cloudflare/cloudflared:latest

FROM ${CLOUDFLARED_IMAGE} AS cloudflared

FROM ${NODE_IMAGE}

# 在阶段内重新声明才能用于下面的 RUN
ARG NPM_REGISTRY=https://registry.npmmirror.com

LABEL org.opencontainers.image.title="CF Tunnel Manager" \
      org.opencontainers.image.version="1.8.4" \
      org.opencontainers.image.description="Cloudflare Tunnel 多隧道管理面板 - 单容器多隧道并行"

# git：用于「关于」页的面板内一键更新（检查新版本 / 拉取新代码）
RUN apk add --no-cache tini git

# cloudflared 二进制（alpine 版，musl 兼容）
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared

# 依赖装到独立目录：/app 会被宿主机源码卷覆盖，故依赖不能放在 /app/node_modules
COPY package.json /opt/deps/package.json
RUN cd /opt/deps && npm install --omit=dev --registry=${NPM_REGISTRY}

# 源码拷一份进镜像：不挂载源码卷时也能独立运行
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY update.sh ./

# 数据目录（凭据/配置/日志/会话持久化）
RUN mkdir -p /data
VOLUME ["/data"]

# Web 面板 / 外部 API / MCP
EXPOSE 19090 19092 19093

ENV WEB_PORT=19090 \
    API_PORT=19092 \
    MCP_PORT=19093 \
    DATA_DIR=/data \
    APP_DIR=/app \
    NODE_PATH=/opt/deps/node_modules

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
