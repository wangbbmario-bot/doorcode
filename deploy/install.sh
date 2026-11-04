#!/bin/bash
# =====================================================
# install.sh —— 在服务器上一键安装/更新 doorcode
#
# 前提：代码已经上传到 /opt/doorcode（含 dist/、server/、package.json、package-lock.json）
#      （用同目录的 upload.sh 从本地传）
#
# 用法：
#   bash install.sh            # 首次安装 / 更新（都可重复执行）
#   bash install.sh --check    # 只检查环境，不改任何东西
# =====================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/doorcode}"
SERVICE_NAME="${SERVICE_NAME:-doorcode}"
LOG_DIR="/var/log/${SERVICE_NAME}"
NODE_VERSION="${NODE_VERSION:-v22.23.4}"
NODE_PREFIX="${NODE_PREFIX:-/usr/local/node22}"
SITE_USER="${SITE_USER:-doorcode}"
PORT="${PORT:-8787}"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

log() { echo "[install] $*"; }
die() { echo "[install][错误] $*" >&2; exit 1; }

# ---------- 0. 前置检查 ----------
log "检查前置条件…"
[ -d "$APP_DIR" ] || die "找不到 $APP_DIR（代码还没上传？先跑 deploy/upload.sh）"
[ -f "$APP_DIR/server/index.mjs" ] || die "$APP_DIR/server/index.mjs 不存在"
if [ ! -d "$APP_DIR/dist" ]; then
  die "$APP_DIR/dist 不存在 —— 服务器上不装 vite，dist 必须本地 npm run build 后一起传"
fi
log "  dist/ $(du -sh "$APP_DIR/dist" | cut -f1)  server/generated/ $(du -sh "$APP_DIR/server/generated" 2>/dev/null | cut -f1 || echo '（无）')"

if [ "$CHECK_ONLY" = "1" ]; then
  log "node: $(command -v node || echo '未安装')"
  log "磁盘: $(df -h / | tail -1 | awk '{print $4" 可用"}')"
  log "内存: $(free -m | awk '/^Mem:/{print $7"MB 可用"}')"
  log "端口 $PORT: $(ss -tln | grep -q ":$PORT " && echo '已被占用' || echo '空闲')"
  exit 0
fi

# ---------- 1. Node（没装就装固定版本）----------
if ! command -v node >/dev/null 2>&1; then
  log "安装 Node ${NODE_VERSION}（LTS，与 todo 容器里的版本一致）…"
  cd /usr/local
  curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" \
    || die "下载 Node 失败（检查服务器能否访问 nodejs.org）"
  tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" || die "解压 Node 失败"
  rm -rf "$NODE_PREFIX"
  mv "node-${NODE_VERSION}-linux-x64" "$NODE_PREFIX"
  ln -sf "$NODE_PREFIX/bin/node" /usr/local/bin/node
  ln -sf "$NODE_PREFIX/bin/npm"  /usr/local/bin/npm
  rm -f "node-${NODE_VERSION}-linux-x64.tar.xz"
fi
log "Node: $(node --version)  ($(command -v node))"

# Express 5 需要 Node >= 18
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit((a>18||(a===18&&b>=0))?0:1)" \
  || die "Node 版本过低（Express 5 需要 >= 18）"

# ---------- 2. 专用用户 ----------
if ! id -u "$SITE_USER" >/dev/null 2>&1; then
  log "创建系统用户 ${SITE_USER}…"
  useradd -r -s /sbin/nologin -M -d "$APP_DIR" "$SITE_USER"
fi

# ---------- 3. 目录与权限 ----------
log "准备目录…"
mkdir -p "$LOG_DIR"
[ -f "$APP_DIR/.env" ] || { echo "[install][警告] 没有 .env —— ARK key 未配置，图片生成会用不了" >&2; }

# .env 只给属主可读（里面有 ARK_API_KEY）
[ -f "$APP_DIR/.env" ] && chmod 600 "$APP_DIR/.env"

chown -R "$SITE_USER:$SITE_USER" "$APP_DIR" "$LOG_DIR"

# ---------- 4. 运行时依赖（服务器不需要 vite/react）----------
if [ ! -d "$APP_DIR/node_modules/express" ]; then
  log "安装运行时依赖（npm ci --omit=dev，只要 express）…"
  cd "$APP_DIR"
  npm ci --omit=dev --no-audit --no-fund
fi

# ---------- 5. systemd ----------
log "安装 systemd 服务…"
cp "$APP_DIR/deploy/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || true
systemctl restart "${SERVICE_NAME}"

# ---------- 6. 健康检查 ----------
log "等待服务就绪…"
OK=0
for i in $(seq 1 20); do
  sleep 1
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" >/tmp/doorcode-health.json 2>/dev/null; then
    OK=1; break
  fi
done
[ "$OK" = "1" ] || { systemctl status "${SERVICE_NAME}" --no-pager -l | tail -20; die "服务没起来，看上面的 status 和 $LOG_DIR/app.log"; }

log "健康检查通过: $(cat /tmp/doorcode-health.json)"

# ---------- 7. 汇总 ----------
echo
systemctl status "${SERVICE_NAME}" --no-pager | head -3
echo
echo "  访问地址 : http://47.107.46.78:${PORT}"
echo "  健康检查 : curl http://127.0.0.1:${PORT}/api/health"
echo "  日志     : tail -f ${LOG_DIR}/app.log"
echo
if grep -qE '^SITE_PASSWORD=.+' "$APP_DIR/.env" 2>/dev/null; then
  echo "  ✅ SITE_PASSWORD 已设置（外部访问需要口令）"
else
  echo "  ⚠️  SITE_PASSWORD 没设 —— 公网任何人都能调 /api/generate 烧你的 ARK 额度、翻所有人的效果图"
  echo "     补上：echo \"SITE_PASSWORD='你的口令'\" >> ${APP_DIR}/.env && systemctl restart ${SERVICE_NAME}"
fi
