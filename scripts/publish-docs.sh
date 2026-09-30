#!/usr/bin/env bash
# 构建 VitePress 文档站，并把产物发布到 gh-pages 分支（GitHub Pages 由此分支直接提供）。
#
# 为什么不用 GitHub Actions：推送 .github/workflows/ 下的文件要求令牌具备 workflow 权限，
# 没有该权限时会被 GitHub 直接拒绝。此脚本只需要普通仓库权限即可发布，随时可用。
#
# 用法：
#   bash scripts/publish-docs.sh
#
# 可用环境变量覆盖：
#   REPO_SLUG        默认 lieren2012/cloudflare-tunnel-manager
#   PAGES_BRANCH     默认 gh-pages
#   DOCS_BASE_NAME   默认 cloudflare-tunnel-manager（Pages 站点子路径）
#   HTTPS_PROXY      国内直连 GitHub 不稳时，例如 http://127.0.0.1:7890

set -uo pipefail

REPO_SLUG="${REPO_SLUG:-lieren2012/cloudflare-tunnel-manager}"
PAGES_BRANCH="${PAGES_BRANCH:-gh-pages}"
DOCS_BASE_NAME="${DOCS_BASE_NAME:-cloudflare-tunnel-manager}"

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
DIST="docs/.vitepress/dist"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 找不到 npm，请先安装 Node.js 20+ 并确保 npm 在 PATH 中"
  exit 1
fi

echo "==> 1/4 构建文档站（base=/${DOCS_BASE_NAME}/）"
# 注意：base 不要带前导斜杠，Git Bash 会把带斜杠的环境变量值当成路径转换成 Windows 盘符路径
if ! DOCS_BASE="$DOCS_BASE_NAME" npm run docs:build; then
  echo "❌ 构建失败"
  exit 1
fi

if [ ! -d "$DIST" ]; then
  echo "❌ 找不到构建产物 $DIST"
  exit 1
fi

echo "==> 2/4 准备发布目录"
WORK="$(mktemp -d)"
cp -r "$DIST"/. "$WORK"/ || { echo "❌ 复制构建产物失败"; exit 1; }
# GitHub Pages 的 Jekyll 处理会忽略下划线开头的文件/目录，关掉它
touch "$WORK/.nojekyll"

cd "$WORK" || exit 1
git init -q -b "$PAGES_BRANCH" >/dev/null 2>&1
git checkout -q -B "$PAGES_BRANCH" >/dev/null 2>&1
git add -A

AUTHOR_NAME="$(git -C "$ROOT" config user.name 2>/dev/null || true)"
AUTHOR_MAIL="$(git -C "$ROOT" config user.email 2>/dev/null || true)"
[ -n "$AUTHOR_NAME" ] || AUTHOR_NAME="lieren2012"
[ -n "$AUTHOR_MAIL" ] || AUTHOR_MAIL="lieren2012@users.noreply.github.com"

git -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_MAIL" \
  commit -q -m "docs: 发布文档站（$(date '+%Y-%m-%d %H:%M')）"
LOCAL_TREE="$(git rev-parse HEAD^{tree})"

echo "==> 3/4 读取线上版本并比对内容"
git remote add origin "https://github.com/${REPO_SLUG}.git"
REMOTE_TREE=""
if git -c http.version=HTTP/1.1 fetch -q --depth 1 origin "$PAGES_BRANCH" 2>/dev/null; then
  REMOTE_TREE="$(git rev-parse "FETCH_HEAD^{tree}" 2>/dev/null || true)"
else
  echo "    ⚠️ 暂时读不到远端 ${PAGES_BRANCH}（网络/权限），将直接尝试发布"
fi
echo "    本地内容指纹：${LOCAL_TREE}"
[ -n "$REMOTE_TREE" ] && echo "    线上内容指纹：${REMOTE_TREE}"
if [ -n "$REMOTE_TREE" ] && [ "$LOCAL_TREE" = "$REMOTE_TREE" ]; then
  echo "✅ 线上内容与本次构建完全一致，无需重新发布"
  cd "$ROOT" && rm -rf "$WORK"
  exit 0
fi

echo "==> 4/4 推送到 ${PAGES_BRANCH} 分支"
if ! git -c http.version=HTTP/1.1 push -f origin "HEAD:refs/heads/${PAGES_BRANCH}"; then
  echo "❌ 推送失败。国内直连不稳时可加代理重试："
  echo "   HTTPS_PROXY=http://127.0.0.1:7890 bash scripts/publish-docs.sh"
  cd "$ROOT" && rm -rf "$WORK"
  exit 1
fi

cd "$ROOT" && rm -rf "$WORK"
echo "✅ 已发布：https://${REPO_SLUG%%/*}.github.io/${REPO_SLUG##*/}/"
echo "   （GitHub Pages 通常 30~60 秒后生效，浏览器请 Ctrl+F5 强刷）"
