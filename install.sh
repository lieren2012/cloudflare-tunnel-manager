#!/usr/bin/env bash
set -Eeuo pipefail
if [ -n "${CFM_DIR:-}" ]; then
  APP_DIR="$CFM_DIR"
elif [ -f "$PWD/docker-compose.yml" ] && [ -d "$PWD/.git" ]; then
  APP_DIR="$PWD"
elif [ -d "$HOME/cloudflare-tunnel-manager/.git" ]; then
  APP_DIR="$HOME/cloudflare-tunnel-manager"
else
  APP_DIR="$PWD/cloudflare-tunnel-manager"
fi
REPO="${CFM_REPO:-https://github.com/lieren2012/cloudflare-tunnel-manager.git}"
PORT="${CFM_PORT:-19090}"
MIRRORS=("" "https://v4.gh-proxy.org/" "https://ghfast.top/" "https://gh-proxy.com/")
die(){ echo "❌ $*" >&2; exit 1; }
command -v git >/dev/null || die "未找到 git，请先安装 git"
command -v docker >/dev/null || die "未找到 docker，请先安装 Docker"
docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 || die "未找到 Docker Compose"
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi
echo "==> 检测最快代码镜像..."
best=""; best_time=999999999999999999
for prefix in "${MIRRORS[@]}"; do
  url="${prefix}${REPO}"
  start=$(date +%s%N 2>/dev/null || date +%s000000000)
  if git -c http.version=HTTP/1.1 ls-remote --heads "$url" main >/dev/null 2>&1; then
    end=$(date +%s%N 2>/dev/null || date +%s000000000); elapsed=$((end-start))
    echo "    ${prefix:-GitHub 直连}: ${elapsed} ns"
    if (( elapsed < best_time )); then best="$prefix"; best_time=$elapsed; fi
  else echo "    ${prefix:-GitHub 直连}: 不可用"; fi
done
[ "$best_time" -lt 999999999999999999 ] || die "所有代码源均不可用，请检查网络"
echo "    已选择：${best:-GitHub 直连}"
if [ -d "$APP_DIR/.git" ]; then
  if [ -d "$APP_DIR/data" ]; then
    backup="$APP_DIR/data.backup.$(date +%Y%m%d%H%M%S)"
    cp -a "$APP_DIR/data" "$backup"
    echo "    已备份数据：$backup"
  fi
  git -C "$APP_DIR" fetch --depth=1 "${best}${REPO}" main
  git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth=1 "${best}${REPO}" "$APP_DIR"
fi
cd "$APP_DIR"; mkdir -p data; "${DC[@]}" up -d --build
ip=$(hostname -I 2>/dev/null | awk '{print $1}'); [ -n "$ip" ] || ip="127.0.0.1"
echo ""; echo "✅ CF Tunnel Manager v1.8.2 安装/升级完成"; echo "   面板地址: http://${ip}:${PORT}"; echo "   数据目录: ${APP_DIR}/data"; echo "   卸载命令: bash ${APP_DIR}/uninstall.sh"
