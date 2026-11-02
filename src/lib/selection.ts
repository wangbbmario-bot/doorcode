import type { Catalog, FaceSpec, Selection, Slot } from '../types'
import { slotId, ZONE_LABEL } from '../types'

const ZONE_CN = ZONE_LABEL

/* ------------------------------------------------------------------
 * 左右轴对称模型
 *
 * 所有门面（2/4/6/8 扇）的门扇数都是偶数，中轴落在第 N/2 扇与第 N/2+1 扇之间。
 *   左半 = 第 1 .. N/2 扇      右半 = 第 N/2+1 .. N 扇
 *   镜像：第 i 扇  ↔  第 N+1-i 扇
 *
 * 业务上只让用户配置**左半**，右半自动镜像：
 *   - 选区框：只有左半可点
 *   - 存储：sel.emboss 只存左半
 *   - 合成 / 提示词：右半按镜像推导
 * ------------------------------------------------------------------ */

/** 左半门扇数（偶数门扇时中轴落在两扇之间） */
export function leftHalfCount(face: FaceSpec): number {
  return Math.floor(face.leaves.length / 2)
}

/** 该门扇是否在可配置的左半 */
export function isLeftHalf(face: FaceSpec, leaf: number): boolean {
  return leaf <= leftHalfCount(face)
}

/** 右半门扇号 -> 对应的左半门扇号 */
export function mirrorLeaf(face: FaceSpec, leaf: number): number {
  const n = face.leaves.length
  return n + 1 - leaf
}

/** 镜像槽位 */
export function mirrorSlot(face: FaceSpec, s: Slot): Slot {
  return { leaf: mirrorLeaf(face, s.leaf), zone: s.zone }
}

/** 清理配置里落在右半的旧数据（兼容早期版本存了全量的配置） */
export function pruneRightHalf(sel: Selection, face: FaceSpec): Selection {
  const kept: Record<string, string> = {}
  for (const [k, v] of Object.entries(sel.emboss)) {
    const leaf = Number(k.split(':')[0])
    if (isLeftHalf(face, leaf)) kept[k] = v
  }
  return { ...sel, emboss: kept }
}

/** 切换槽位选中状态（同一扇门的上/中/下可连续选中） */
export function toggleSlot(slots: Slot[], s: Slot): Slot[] {
  const id = slotId(s)
  return slots.some((p) => slotId(p) === id)
    ? slots.filter((p) => slotId(p) !== id)
    : [...slots, s]
}

/** 把压花应用到所有已选槽位 */
export function applyEmboss(
  emboss: Record<string, string>,
  slots: Slot[],
  name: string,
): Record<string, string> {
  const next = { ...emboss }
  for (const s of slots) next[slotId(s)] = name
  return next
}

/** 取某槽位生效的压花：左半取自身，右半取左半镜像 */
export function effectiveEmboss(
  emboss: Record<string, string>,
  face: FaceSpec,
  slot: Slot,
): string | undefined {
  const own = emboss[slotId(slot)]
  if (own) return own
  if (!isLeftHalf(face, slot.leaf)) {
    return emboss[slotId(mirrorSlot(face, slot))]
  }
  return undefined
}

/** 清除某个槽位的压花（槽位本身保持选中，可直接换别的压花） */
export function clearEmboss(
  emboss: Record<string, string>,
  s: Slot,
): Record<string, string> {
  const id = slotId(s)
  if (!emboss[id]) return emboss
  const next = { ...emboss }
  delete next[id]
  return next
}

/** 切换某个分类的选中项（同一点击取消） */
export function toggleChoice(current: string | null, name: string): string | null {
  return current === name ? null : name
}

/** 切换门面类型时清空压花 */
export function switchFace(sel: Selection, faceKey: string): Selection {
  return { ...sel, face: faceKey, emboss: {} }
}

/**
 * 找 y 落在哪一行（rowTops 是每行 top 的前缀和，长度 = 行数 + 1）
 * 返回**最后一个** rowTops[r] <= y 的行号；y 超出总高度时返回行数
 */
export function findRow(rowTops: number[], y: number): number {
  let lo = 0
  let hi = rowTops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (rowTops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * 虚拟滚动窗口计算（支持**可变行高**）
 *
 * 压花素材形状差异极大（比例 0.1~3.6），如果行高固定按最扁的算，
 * 矮素材那一行下方会整块留白（表现为「空了一行」）。
 * 所以行高按**每行实际的最高格子**算，rowTops 用前缀和定位。
 *
 * @param rowTops 每行 top 的前缀和，rowTops[r] = 第 r 行 top，末位 = 总高度
 */
export function computeWindow(
  scrollTop: number,
  viewportH: number,
  rowTops: number[],
  cols: number,
  total: number,
  overscan = 3,
): { start: number; end: number } {
  const totalRows = rowTops.length - 1
  if (totalRows <= 0 || total <= 0 || cols <= 0) return { start: 0, end: 0 }
  const firstVisible = findRow(rowTops, scrollTop)
  const lastVisible = findRow(rowTops, scrollTop + viewportH)
  const firstRow = Math.max(0, firstVisible - overscan)
  const lastRow = Math.min(totalRows, lastVisible + overscan)
  return { start: firstRow * cols, end: Math.min(total, lastRow * cols) }
}

/** 按容器宽度算列数与列宽 */
export function computeGrid(
  paneWidth: number,
  minCell: number,
  gap: number,
  pad: number,
): { cols: number; cellW: number } {
  const w = paneWidth - pad * 2
  if (w <= 0) return { cols: 1, cellW: minCell }
  const cols = Math.max(1, Math.floor((w + gap) / (minCell + gap)))
  const cellW = Math.floor((w - gap * (cols - 1)) / cols)
  return { cols, cellW }
}

/**
 * 缩略图显示高度
 *
 * 宽高比 < 1 的纵向素材（门锁 1:2.4、门柱 1:4）要按真实比例给高度，
 * 否则格子是正方形，图片会被 CSS 的 object-fit 裁掉大半。
 * maxH 是格高上限（相对格宽的倍数），防止 1:10 这种极端比例撑爆一屏。
 */
export function thumbHeight(cellW: number, thumbRatio: number, maxH = 1): number {
  const r = thumbRatio || 1
  const byRatio = Math.round(cellW / r)
  if (r >= 1) return byRatio
  return Math.min(byRatio, Math.round(cellW * maxH))
}

/** 配置清单条目（对应「我的配置」面板） */
export interface ConfigEntry {
  /** 唯一 key：face / head / pillar / lock / color / emboss:<leaf>:<zone> */
  key: string
  group: string
  label: string
  /** 显示名 */
  value: string
  /** 补充说明，如「第 3 扇 · 上」 */
  detail?: string
  /** 压花项携带槽位信息，便于单独清除 */
  slot?: Slot
}

const GROUP_LABEL: Record<string, string> = {
  face: '门面',
  head: '门头',
  pillar: '门柱',
  lock: '门锁',
  color: '颜色',
  emboss: '压花',
}

/**
 * 构建「我的配置」清单：门面 / 门头 / 门柱 / 门锁 / 颜色 / 压花
 * 顺序固定，便于销售现场按顺序讲解
 */
export function buildConfigEntries(
  sel: Selection,
  catalog: Catalog,
  faceSpec?: FaceSpec,
): ConfigEntry[] {
  const out: ConfigEntry[] = []
  const nameOf = (group: string, n: string | null) => {
    if (!n) return null
    const g = catalog[group]
    if (!g) return null
    const it = g.items.find((i) => i.name === n)
    return it ? it.name : null
  }

  const face = nameOf('face', sel.face)
  if (face) {
    out.push({ key: 'face', group: 'face', label: GROUP_LABEL.face, value: face })
  }
  const head = nameOf('head', sel.head)
  if (head) {
    out.push({ key: 'head', group: 'head', label: GROUP_LABEL.head, value: head })
  }
  const pillar = nameOf('pillar', sel.pillarL)
  if (pillar) {
    out.push({ key: 'pillar', group: 'pillar', label: GROUP_LABEL.pillar, value: pillar })
  }
  const lock = nameOf('lock', sel.lock)
  if (lock) {
    out.push({ key: 'lock', group: 'lock', label: GROUP_LABEL.lock, value: lock })
  }
  const color = nameOf('color', sel.color)
  if (color) {
    out.push({ key: 'color', group: 'color', label: GROUP_LABEL.color, value: color })
  }

  // 压花：按槽位顺序列出
  // 顺序：门扇号升序，同一门扇内按「上 -> 中 -> 下」
  const ZONE_ORDER: Slot['zone'][] = ['top', 'mid', 'bottom']
  const slots = Object.keys(sel.emboss)
    .map((k) => {
      const [leaf, zone] = k.split(':')
      return { leaf: Number(leaf), zone: zone as Slot['zone'], name: sel.emboss[k] }
    })
    .sort(
      (a, b) =>
        a.leaf - b.leaf || ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone),
    )
  for (const s of slots) {
    // 门左右对称：右半是左半的镜像，配置清单只列左半
    if (faceSpec && !isLeftHalf(faceSpec, s.leaf)) continue
    const item = nameOf('emboss', s.name)
    if (!item) continue
    out.push({
      key: `emboss:${s.leaf}:${s.zone}`,
      group: 'emboss',
      label: GROUP_LABEL.emboss,
      value: item,
      detail: `第 ${s.leaf} 扇 · ${ZONE_CN[s.zone]}`,
      slot: { leaf: s.leaf, zone: s.zone },
    })
  }
  return out
}

/** 清除某个配置项，返回新的 sel（压花项只清那一个槽位） */
export function clearConfigEntry(sel: Selection, entry: ConfigEntry): Selection {
  switch (entry.group) {
    case 'face':
      return { ...sel, emboss: {} }
    case 'head':
      return { ...sel, head: null }
    case 'pillar':
      return { ...sel, pillarL: null, pillarR: null }
    case 'lock':
      return { ...sel, lock: null }
    case 'color':
      return { ...sel, color: null }
    case 'emboss':
      return entry.slot
        ? { ...sel, emboss: clearEmboss(sel.emboss, entry.slot) }
        : sel
    default:
      return sel
  }
}

/**
 * 压花应用：必须先选好位置再选类型。
 * 应用后重置「待选位置」，避免选完压花不知道落到哪些格。
 */
export function pickEmboss(
  sel: Selection,
  slots: Slot[],
  name: string,
): { sel: Selection; slots: Slot[] } {
  if (slots.length === 0) return { sel, slots }
  return {
    sel: { ...sel, emboss: applyEmboss(sel.emboss, slots, name) },
    slots: [],
  }
}

/** 历史记录里的配置快照 */
export interface HistoryConfig {
  face?: string
  head?: string | null
  pillarL?: string | null
  pillarR?: string | null
  lock?: string | null
  color?: string | null
  emboss?: Record<string, string>
  slots?: Slot[]
}

/**
 * 套用历史配置（客户说「就按刚才那版改个颜色」）
 * 快照里没配的项会被清空 —— 历史要能准确还原当时那一版
 */
export function applyHistoryConfig(
  cur: Selection,
  cfg: HistoryConfig | null | undefined,
): Selection {
  if (!cfg) return cur
  return {
    ...cur,
    face: cfg.face ?? cur.face,
    head: cfg.head ?? null,
    pillarL: cfg.pillarL ?? null,
    pillarR: cfg.pillarR ?? null,
    lock: cfg.lock ?? null,
    color: cfg.color ?? null,
    emboss: cfg.emboss ?? {},
  }
}
