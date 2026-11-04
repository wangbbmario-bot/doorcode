#!/bin/bash
# =====================================================
# backup.sh —— 备份门锁项目的运行时数据
#
# 数据在哪：server/generated/
#   - index.json      历史索引（配置快照、prompt、回收站标记）
#   - <id>.jpg        生成的效果图
#
# 定时任务（/etc/cron.d/doorcode-backup）：
#   23 3 * * * root /opt/doorcode/deploy/backup.sh >> /var/log/doorcode/backup.log 2>&1
# =====================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/doorcode}"
KEEP_DAYS="${KEEP_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-/opt/doorcode/.backup}"
SRC="${APP_DIR}/server/generated"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -d "$SRC" ]; then
  echo "[backup] 没有 $SRC，跳过"
  exit 0
fi

echo "[backup] 打包 ${SRC} …"
tar czf "${BACKUP_DIR}/generated-${STAMP}.tar.gz" -C "$SRC" .
SIZE=$(du -h "${BACKUP_DIR}/generated-${STAMP}.tar.gz" | cut -f1)
COUNT=$(tar tzf "${BACKUP_DIR}/generated-${STAMP}.tar.gz" | grep -c '\.jpg$' || echo 0)
echo "[backup]   → generated-${STAMP}.tar.gz (${SIZE}, ${COUNT} 张图)"

echo "[backup] 清理 ${KEEP_DAYS} 天前的旧备份 …"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'generated-*.tar.gz' -mtime "+${KEEP_DAYS}" -print -delete

echo "[backup] 当前备份："
ls -lh "$BACKUP_DIR" | tail -5
