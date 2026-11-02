#!/usr/bin/env bash
#
# 一键验收：类型 → 测试 → 几何标定 → 构建 → 安全检查
#
# 任一步失败即 exit 1，失败项会全部列出（不中断，方便一次看全）。
# 用法：bash scripts/verify.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

if [ -t 1 ]; then
  RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; RST=$'\033[0m'
else
  RED=''; GRN=''; YEL=''; DIM=''; RST=''
fi

FAILED=()

step() { printf '\n%s▶ %s%s\n' "$DIM" "$1" "$RST"; }
ok()   { printf '  %s✓%s %s\n' "$GRN" "$RST" "$1"; }
bad()  { printf '  %s✗%s %s\n' "$RED" "$RST" "$1"; FAILED+=("$1"); }
warn() { printf '  %s!%s %s\n' "$YEL" "$RST" "$1"; }

# 跑一条命令，成功记 ok，失败记 bad（不中断，最后统一 exit）
run() {
  local label="$1"; shift
  step "$label"
  if "$@"; then
    ok "$label 通过"
  else
    bad "$label 失败"
  fi
}

printf '%s响当当 XDD · 铜门定制 —— 验收%s\n' "$DIM" "$RST"
printf '%s项目根：%s%s\n' "$DIM" "$ROOT" "$RST"

# ---------------------------------------------------------------- 1. 类型检查
run "类型检查 (tsc --noEmit)" npm run typecheck

# ---------------------------------------------------------------- 2. 单元测试
run "单元测试 (vitest)" npm test

# ---------------------------------------------------------------- 3. 几何标定
run "几何标定校验 (leaf_lines)" npm run verify:geometry

# ---------------------------------------------------------------- 4. 生产构建
run "生产构建 (vite build)" npm run build

# ---------------------------------------------------------------- 5. 安全检查
step "安全检查"

ENV_FILE="$ROOT/.env"

# 5.1 .env 权限必须是 600
if [ -f "$ENV_FILE" ]; then
  PERM="$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '?')"
  if [ "$PERM" = "600" ]; then
    ok ".env 权限 600"
  else
    bad ".env 权限是 $PERM，应为 600（chmod 600 .env）"
  fi
else
  warn ".env 不存在，跳过权限检查"
fi

# 5.2 .env 必须被 git 忽略
if [ -f "$ROOT/.gitignore" ] && grep -qx '\.env' "$ROOT/.gitignore"; then
  ok ".env 已在 .gitignore"
else
  bad ".env 未写入 .gitignore"
fi

# 5.3 取出真实 key（只用于比对，绝不打印）
KEY=''
if [ -f "$ENV_FILE" ]; then
  KEY="$(grep -E '^[[:space:]]*ARK_API_KEY[[:space:]]*=' "$ENV_FILE" | head -1 \
    | sed -E 's/^[[:space:]]*ARK_API_KEY[[:space:]]*=[[:space:]]*//; s/^["'\'']//; s/["'\'']$//')"
fi

if [ -n "$KEY" ]; then
  # 前端产物里绝不能出现 key
  if [ -d "$ROOT/dist" ]; then
    if grep -rqF -- "$KEY" "$ROOT/dist" 2>/dev/null; then
      bad "dist/ 里出现了 ARK key —— 前端 bundle 泄露了密钥"
    else
      ok "dist/ 未包含 ARK key"
    fi
  else
    bad "dist/ 不存在，构建没有产出"
  fi

  # 源码里绝不能出现 key
  if grep -rqF -- "$KEY" "$ROOT/src" 2>/dev/null; then
    bad "src/ 里出现了 ARK key"
  else
    ok "src/ 未包含 ARK key"
  fi
else
  warn "未读到 ARK_API_KEY，跳过 key 泄露比对"
fi

# 5.4 前端代码不得引用 ARK_API_KEY / 端点
if grep -rn -E 'ARK_API_KEY|ark\.cn-beijing\.volces\.com' "$ROOT/src" >/dev/null 2>&1; then
  bad "src/ 里出现了 ARK_API_KEY 或 ARK 端点字面量"
else
  ok "src/ 未引用 ARK_API_KEY / ARK 端点"
fi

# 5.5 密钥只能在后端读
if grep -rn -E 'ARK_API_KEY' "$ROOT/server" >/dev/null 2>&1; then
  ok "ARK_API_KEY 只在 server/ 内读取"
else
  warn "server/ 里没找到 ARK_API_KEY 读取逻辑，请人工确认"
fi

# ---------------------------------------------------------------- 汇总
printf '\n%s────────────────────────────────────────%s\n' "$DIM" "$RST"
if [ "${#FAILED[@]}" -eq 0 ]; then
  printf '%s全部通过%s\n' "$GRN" "$RST"
  exit 0
fi
printf '%s%d 项失败：%s\n' "$RED" "${#FAILED[@]}" "$RST"
for f in "${FAILED[@]}"; do
  printf '  %s· %s%s\n' "$RED" "$f" "$RST"
done
exit 1
