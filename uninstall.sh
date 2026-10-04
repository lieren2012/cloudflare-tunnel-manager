#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi
echo "将停止并删除容器，保留 ${APP_DIR}/data 数据。"
read -r -p "确认卸载？输入 YES：" answer
[ "$answer" = YES ] || { echo "已取消"; exit 0; }
"${DC[@]}" -f "$APP_DIR/docker-compose.yml" down --remove-orphans || true
echo "✅ 已卸载容器。数据仍保留在 ${APP_DIR}/data。"
