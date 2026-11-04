#!/bin/bash
# =====================================================
# upload.sh —— 本地打包门锁项目的部署产物并传到服务器
#
# 用法：
#   bash deploy/upload.sh <服务器IP> [ssh用户]
# 例：
#   bash deploy/upload.sh 47.107.46.78 root
#
# 传什么：
#   dist/              前端构建产物（服务器不装 vite，必须本地 npm run build 后传）
#   server/            Express 后端 + generated/（历史图与索引）
#   package.json       依赖声明
#   package-lock.json  锁版本（npm ci 靠它）
#   deploy/            部署脚本与 systemd unit
#   .env               ARK key（单独传，不进 tar 包，避免留残余）
#
# 不传：
#   node_modules/      服务器上 npm ci --omit=dev 装
#   src/ tests/        服务器不需要源码（要改代码在本地改完重传）
#   .materials/ .tmp/  本地素材/调试残留
# =====================================================
set -euo pipefail

HOST="${1:-47.107.46.78}"
SSH_USER="${2:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/doorcode}"
PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARBALL="/tmp/doorcode-deploy-${STAMP}.tar.gz"

cd "$PROJ_DIR"

echo "[upload] 1/4 本地构建前端（服务器没有 vite）…"
npm run build

echo "[upload] 2/4 打包…"
# --exclude 顺序要紧：先排掉 node_modules，最后再排掉 .git
tar czf "$TARBALL" \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.materials' \
  --exclude='./.tmp' \
  --exclude='./.env' \
  ./dist ./server ./deploy ./package.json ./package-lock.json

echo "        体积: $(du -h "$TARBALL" | cut -f1)"
tar tzf "$TARBALL" | head -5
echo "        …共 $(tar tzf "$TARBALL" | wc -l) 个条目"

echo "[upload] 3/4 传到 ${SSH_USER}@${HOST}:${REMOTE_DIR} …"
ssh "${SSH_USER}@${HOST}" "mkdir -p ${REMOTE_DIR}"
scp "$TARBALL" "${SSH_USER}@${HOST}:/tmp/doorcode-deploy.tar.gz"
scp "$PROJ_DIR/.env" "${SSH_USER}@${HOST}:${REMOTE_DIR}/.env"

echo "[upload] 4/4 服务器上解包并安装…"
ssh "${SSH_USER}@${HOST}" "set -e
  cd ${REMOTE_DIR}
  tar xzf /tmp/doorcode-deploy.tar.gz
  chmod 600 ${REMOTE_DIR}/.env
  bash ${REMOTE_DIR}/deploy/install.sh"

rm -f "$TARBALL"
ssh "${SSH_USER}@${HOST}" "rm -f /tmp/doorcode-deploy.tar.gz"

echo
echo "✅ 部署完成 → http://${HOST}:8787"
