#!/usr/bin/env bash
# CF Tunnel Manager 一键更新脚本
# 用法：在项目根目录执行  bash update.sh
# 说明：只更新代码，data/ 目录（凭据/用户/隧道配置）不受影响。

set -e
cd "$(dirname "$0")"

echo "==> 1/4 检查远端更新..."
git fetch origin -q

NEW=$(git log --oneline HEAD..origin/main | head -20)
if [ -z "$NEW" ]; then
  echo "已是最新版本：$(git log --oneline -1)"
else
  echo "发现新版本，即将更新："
  echo "$NEW"
  echo "==> 2/4 拉取最新代码（data/ 不受影响）..."
  git reset --hard origin/main
  echo "当前版本：$(git log --oneline -1)"
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
