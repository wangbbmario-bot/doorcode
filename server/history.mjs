/**
 * 生成历史索引的读写（纯文件操作，不依赖 express，便于单测）
 *
 * 索引文件：server/generated/index.json
 * 结构：[{ id, file, createdAt, elapsedMs, size, usage, prompt, config, deletedAt? }]
 *
 * 删除采用**软删**：只打 deletedAt 标记，文件留在磁盘上，可恢复；
 * 彻底删除（purge）才真正删文件 —— 生成图是客户资产，硬删不可逆。
 */
import fs from 'node:fs'
import path from 'node:path'

export const MAX_HISTORY = 200

export function historyIndexPath(outDir) {
  return path.join(outDir, 'index.json')
}

/** 读历史；includeDeleted=true 时连回收站的一起返回 */
export function readHistory(outDir, includeDeleted = false) {
  let arr = []
  try {
    const raw = fs.readFileSync(historyIndexPath(outDir), 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) arr = parsed
  } catch {
    arr = []
  }
  if (includeDeleted) return arr
  return arr.filter((x) => !x.deletedAt)
}

/**
 * 只读回收站（已软删）的记录
 * 注意与 readHistory(outDir, true) 的区别：
 *   后者是「读全部（内部用）」，本函数是「读回收站（对外用）」。
 */
export function readTrash(outDir) {
  return readHistory(outDir, true).filter((x) => x.deletedAt)
}

/**
 * 写历史
 * - 未删记录最多保留 MAX_HISTORY 条（多的从尾部丢弃）
 * - 回收站里的记录不占额度，全部保留
 */
export function writeHistory(outDir, list) {
  const alive = list.filter((x) => !x.deletedAt).slice(0, MAX_HISTORY)
  const dead = list.filter((x) => x.deletedAt)
  const out = [...alive, ...dead]
  fs.writeFileSync(historyIndexPath(outDir), JSON.stringify(out, null, 2))
  return out
}

/** 追加一条生成记录（新的放最前） */
export function pushHistory(outDir, rec) {
  const list = readHistory(outDir, true)
  list.unshift(rec)
  // 只对未删的记录做条数上限，已删的留在回收站不占额度
  const alive = list.filter((x) => !x.deletedAt)
  const dead = list.filter((x) => x.deletedAt)
  return writeHistory(outDir, [...alive.slice(0, MAX_HISTORY), ...dead])
}

/**
 * 软删：打 deletedAt 标记，文件保留
 * @returns 被标记的记录；不存在或已删则返回 null
 */
export function softDeleteHistory(outDir, id) {
  const list = readHistory(outDir, true)
  const rec = list.find((x) => x.id === id && !x.deletedAt)
  if (!rec) return null
  rec.deletedAt = new Date().toISOString()
  writeHistory(outDir, list)
  return rec
}

/**
 * 从回收站恢复
 * 恢复的记录会排到未删列表最前 —— 否则未删记录已满 MAX_HISTORY 时，
 * 它会在写盘时被上限截掉，表现为「恢复成功但列表里没有」。
 */
export function restoreHistory(outDir, id) {
  const list = readHistory(outDir, true)
  const idx = list.findIndex((x) => x.id === id && x.deletedAt)
  if (idx === -1) return null
  const [rec] = list.splice(idx, 1)
  delete rec.deletedAt
  const alive = list.filter((x) => !x.deletedAt)
  const dead = list.filter((x) => x.deletedAt)
  writeHistory(outDir, [rec, ...alive, ...dead])
  return rec
}

/**
 * 彻底删除：移出索引 + 删文件
 * @returns 被删除的记录
 */
export function purgeHistory(outDir, id) {
  const list = readHistory(outDir, true)
  const idx = list.findIndex((x) => x.id === id)
  if (idx === -1) return null
  const [rec] = list.splice(idx, 1)
  writeHistory(outDir, list)
  try {
    fs.unlinkSync(path.join(outDir, `${rec.id}.jpg`))
  } catch {
    /* 文件可能已不存在 */
  }
  return rec
}
