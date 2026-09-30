#!/usr/bin/env bash
# CF Tunnel Manager 一键更新脚本
# 用法：在项目根目录执行  bash update.sh
# 说明：只更新代码，data/ 目录（凭据/用户/隧道配置）不受影响。
#       国内直连 GitHub 不稳时，会自动切换到内置加速镜像重试。

cd "$(dirname "$0")" || exit 1

BRANCH="${GIT_BRANCH:-main}"
ORIGIN=$(git remote get-url origin 2>/dev/null)
[ -z "$ORIGIN" ] && ORIGIN="https://github.com/lieren2012/cloudflare-tunnel-manager.git"

# 内置加速镜像（只读 GitHub 反代，仅用于拉取公开代码，不涉及任何凭据）
MIRRORS=(
  "https://v4.gh-proxy.org/"
  "https://gh-proxy.com/"
  "https://ghfast.top/"
)

# 统一使用 HTTP/1.1：规避「HTTP/2 stream was not closed cleanly」类报错
gitf() {
  git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 \
      fetch --quiet --force "$1" "$BRANCH" 2>&1
}

echo "==> 1/4 检查远端更新..."
if OUT=$(gitf "$ORIGIN"); then
  echo "    直连 GitHub 成功"
else
  echo "    直连失败：$(echo "$OUT" | head -1)"
  OK=0
  for m in "${MIRRORS[@]}"; do
    echo "    尝试镜像 $m ..."
    if OUT=$(gitf "${m}${ORIGIN}"); then echo "    镜像可用：$m"; OK=1; break; fi
    echo "    该镜像失败：$(echo "$OUT" | head -1)"
  done
  if [ "$OK" != "1" ]; then
    echo ""
    echo "❌ 所有更新源均不可用。可指定本机代理后重试，例如："
    echo "   git -c http.proxy=http://127.0.0.1:7890 fetch origin $BRANCH"
    echo "   然后执行： git reset --hard FETCH_HEAD"
    exit 1
  fi
fi

NEW=$(git log --oneline "HEAD..FETCH_HEAD" 2>/dev/null | head -20)
if [ -z "$NEW" ]; then
  echo "    已是最新版本：$(git log --oneline -1)"
else
  echo "==> 2/4 发现新版本，即将更新："
  echo "$NEW" | sed 's/^/        /'
  if ! git reset --hard FETCH_HEAD; then
    echo "❌ 代码更新失败，请检查目录权限后重试。"
    exit 1
  fi
  echo "    当前版本：$(git log --oneline -1)"
fi

echo "==> 3/4 重建并重启容器..."
if docker compose version >/dev/null 2>&1; then
  docker compose up -d --build
else
  docker-compose up -d --build
fi

echo "==> 4/4 清理悬空镜像..."
docker image prune -f >/dev/null 2>&1 || true

echo ""
echo "完成。浏览器按 Ctrl + F5 强刷即可加载新界面。"
