/**
 * 参考图收集与配额
 *
 * Seedream 5.0 Flash 最多 10 张参考图（含合成底图），
 * 所以必须去重 + 按优先级截断。
 */
import type { Catalog, Selection, ZoneKey } from '../../types'
import { assetUrl } from '../data'
import { findItem, loadImage } from './draw'

/** 参考图上限：10 张 - 合成底图 1 张 */
export const MAX_REF_IMAGES = 9

export interface Ref {
  key: string
  name: string
  dataUri: string
}

/** 槽位按「门扇号 → 上中下」排序 */
const ZONE_ORDER: ZoneKey[] = ['top', 'mid', 'bottom']

export function sortSlotKeys(emboss: Record<string, string>): string[] {
  return Object.keys(emboss).sort(
    (a, b) =>
      Number(a.split(':')[0]) - Number(b.split(':')[0]) ||
      ZONE_ORDER.indexOf(a.split(':')[1] as ZoneKey) -
        ZONE_ORDER.indexOf(b.split(':')[1] as ZoneKey),
  )
}

/**
 * 参考图计划：算出哪些素材会作为参考图发出、哪些因超出上限被省略。
 * 用于 UI 提示与 prompt 生成（被省略的压花靠合成底图传达）。
 */
export function planRefs(
  sel: Selection,
  catalog: Catalog,
  maxRefs: number = MAX_REF_IMAGES,
): { sent: string[]; dropped: string[] } {
  const keys: string[] = []
  const add = (group: string, name: string | null) => {
    if (!name) return
    const item = findItem(catalog, group, name)
    if (!item) return
    const key = `${group}:${item.name}`
    if (!keys.includes(key)) keys.push(key)
  }
  // 部件类优先
  add('head', sel.head)
  add('pillar', sel.pillarL)
  add('lock', sel.lock)
  add('color', sel.color)

  for (const k of sortSlotKeys(sel.emboss)) add('emboss', sel.emboss[k])

  return { sent: keys.slice(0, maxRefs), dropped: keys.slice(maxRefs) }
}

/**
 * 汇总当前选中的素材，作为 AI 参考图。
 *
 * 优先级：
 *   1. 门头 / 门柱 / 门锁 / 颜色  各 1 张（整体风格）
 *   2. 压花：**按样式去重**（同一种压花用在多个位置只发 1 张），再按位置顺序补足
 *
 * 未发出的压花不会丢 —— 合成底图里已经把它们画上去了，AI 照样能看出效果。
 */
export async function collectRefs(
  sel: Selection,
  catalog: Catalog,
  maxRefs: number = MAX_REF_IMAGES,
): Promise<Ref[]> {
  const refs: Ref[] = []
  const seen = new Set<string>()
  const push = async (group: string, name: string | null) => {
    if (!name) return
    const item = findItem(catalog, group, name)
    if (!item) return
    const key = `${group}:${item.name}`
    if (seen.has(key)) return // 去重：同一样式只发一张
    seen.add(key)
    const img = await loadImage(assetUrl(item.prev))
    const c = document.createElement('canvas')
    const MAX = 900
    const k = Math.min(1, MAX / Math.max(img.width, img.height))
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    refs.push({
      key,
      name: item.name,
      dataUri: c.toDataURL('image/jpeg', 0.88),
    })
  }

  // 1) 部件类优先
  await push('head', sel.head)
  await push('pillar', sel.pillarL)
  await push('lock', sel.lock)
  await push('color', sel.color)

  // 2) 压花按位置顺序去重加入，超额则截断
  for (const k of sortSlotKeys(sel.emboss)) {
    if (refs.length >= maxRefs) break
    await push('emboss', sel.emboss[k])
  }
  return refs
}
