#!/usr/bin/env bash
#
# 一键起「本机服务 + 公网隧道」，给客户试用。
#
#   bash scripts/serve-tunnel.sh
#
# 做三件事：
#   1. 构建前端（dist/）
#   2. 起 Node 服务（:8787），托管 dist + /api + 生成图
#   3. 起 cloudflared 隧道，打印公网链接
#
# 环境变量：
#   PORT           服务端口，默认 8787
#   SITE_PASSWORD  访问口令（可选）。设了就全站要口令，
#                  客户打开 https://链接/?k=口令 直接进，地址栏会自动变干净
#
# 注意：cloudflared 的临时隧道**每次重启链接都会变**，且断线即失效。
# 要固定域名需用 Cloudflare Named Tunnel（需自己的域名 + 账号）。
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8787}"
LOG=/tmp/xdd-tunnel.log

say() { printf '\033[36m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# --- 依赖检查 ---
command -v node >/dev/null || die '缺少 node'
command -v npm >/dev/null || die '缺少 npm'
CF=""
for c in cloudflared /tmp/cloudflared "$HOME/.local/share/nodejs/bin/cloudflared"; do
  if command -v "$c" >/dev/null 2>&1; then CF="$c"; break; fi
  if [ -x "$c" ]; then CF="$c"; break; fi
done
if [ -z "$CF" ]; then
  die '缺少 cloudflared。安装：brew install cloudflared  或  npm i -g cloudflared'
fi

# --- 构建 ---
if [ ! -d dist ] || [ -n "$(find src index.html -newer dist/index.html 2>/dev/null | head -1)" ]; then
  say '构建前端…'
  npm run build >/dev/null
fi

# --- 起服务 ---
lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
say "启动服务 :$PORT"
if [ -n "${SITE_PASSWORD:-}" ]; then
  say '已开启访问口令'
  PORT="$PORT" SITE_PASSWORD="$SITE_PASSWORD" node server/index.mjs &
else
  PORT="$PORT" node server/index.mjs &
fi
SERVER_PID=$!
sleep 2
kill -0 "$SERVER_PID" 2>/dev/null || die '服务启动失败，看 /tmp/xdd-tunnel.log'
curl -sS -o /dev/null "http://127.0.0.1:$PORT/api/health" || die '服务健康检查失败'

# --- 起隧道 ---
: > "$LOG"
say '启动隧道…'
"$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >>"$LOG" 2>&1 &
CF_PID=$!

cleanup() {
  kill "$CF_PID" "$SERVER_PID" 2>/dev/null || true
  printf '\n已停止。\n'
}
trap cleanup EXIT INT TERM

URL=""
for _ in $(seq 1 40); do
  sleep 1
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
done
[ -n "$URL" ] || { tail -20 "$LOG"; die '隧道没起来，看上面的日志'; }

printf '\n\033[32m╭──────────────────────────────────────────────╮\033[0m\n'
printf '\033[32m│  客户访问链接                                  │\033[0m\n'
printf '\033[32m╰──────────────────────────────────────────────╯\033[0m\n\n'
if [ -n "${SITE_PASSWORD:-}" ]; then
  printf '  \033[1m%s?k=%s\033[0m   ← 带口令，客户打开直接进\n\n' "$URL" "$SITE_PASSWORD"
fi
printf '  \033[1m%s\033[0m\n\n' "$URL"
printf '  \033[33m! 电脑关机 / 隧道断开会失效，重跑本脚本可换新链接\033[0m\n'
printf '  \033[33m! 完全公开 = 拿到链接的人都能烧 ARK 额度、翻到生成记录\033[0m\n\n'
printf '  Ctrl+C 停止\n\n'

wait "$CF_PID"
