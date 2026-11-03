/**
 * Prompt 生成
 *
 * 关键约束：ARK 输入审核会把产品型号编号（XDD-1801 / 1816 / A01 / 正宗304）
 * 误判为敏感标识（InputTextSensitiveContentDetected），
 * 所以 prompt 里只保留可读中文描述 + Image N 序号引用。
 */
import type { Catalog, FaceSpec, Selection, Slot, ZoneKey } from '../../types'
import { slotId } from '../../types'
import { isLeftHalf, leftHalfCount } from '../selection'
import { findItem } from './draw'

const ZONE_ORDER: ZoneKey[] = ['top', 'mid', 'bottom']

/**
 * 清理素材名称里的产品型号编号。
 * ARK 的输入审核会把 "XDD-1801" / "1816" / "A01" / "正宗304" 这类编号误判为敏感标识
 * （InputTextSensitiveContentDetected），因此 prompt 里只保留可读的中文描述，
 * 型号一律改用图片序号（Image N）引用。
 */
export function cleanName(name: string): string {
  return name
    .replace(/^XDD[-_]?\d+/i, '')        // XDD-1801
    .replace(/^[A-Za-z]{1,4}\d{1,4}$/, '') // A01 / B10 / K01（纯编号）
    .replace(/^[\d.]+/, '')               // 1816 / 1.2
    .replace(/[（(][^）)]*[）)]/g, '')    // 括号补充说明
    .replace(/(正宗)?\s*304/g, '')        // 正宗304 / 304
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 素材在 prompt 里的引用：优先用可读名称，名称被剥空时只用 Image N */
function refPhrase(i: number | undefined, name: string): string {
  const label = cleanName(name)
  const img = i ? `Image ${i}` : ''
  if (!label) return img
  return img ? `${img} 所示的「${label}」` : `「${label}」`
}

/** 已配置的压花位置（门左右对称，只取左半） */
function configuredSlots(sel: Selection, face: FaceSpec): Slot[] {
  return Object.keys(sel.emboss)
    .map((k) => {
      const [leaf, zone] = k.split(':')
      return { leaf: Number(leaf), zone: zone as ZoneKey }
    })
    .filter((s) => isLeftHalf(face, s.leaf))
    .sort(
      (a, b) => a.leaf - b.leaf || ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone),
    )
}

/** 生成给 Seedream 的自然语言描述 */
export function buildPrompt(
  face: FaceSpec,
  sel: Selection,
  catalog: Catalog,
  refIndex: Map<string, number>,
): string {
  const zoneName = { top: '上部', mid: '中部', bottom: '下部' }
  const lines: string[] = []

  lines.push(
    `Image 1 是已经按用户选择合成好的铜门底图（门面/压花/颜色/门头/门柱/门锁都已绘制在图上）。` +
      `请把它渲染成照片级写实的实拍效果图：保持门框、门楣、门柱结构、地面、整体比例和左右对称关系不变，` +
      `并按下面的参考图把对应部件的纹样细节精修到位。`,
  )

  const head = findItem(catalog, 'head', sel.head)
  if (head) {
    const i = refIndex.get(`head:${head.name}`)
    lines.push(`门头（门楣横梁装饰）替换为 ${refPhrase(i, head.name)}样式。`)
  }

  const pl = findItem(catalog, 'pillar', sel.pillarL)
  const pr = findItem(catalog, 'pillar', sel.pillarR)
  if (pl && pr && pl.name === pr.name) {
    const i = refIndex.get(`pillar:${pl.name}`)
    lines.push(`左右门柱装饰替换为 ${refPhrase(i, pl.name)}样式。`)
  } else {
    if (pl) {
      const i = refIndex.get(`pillar:${pl.name}`)
      lines.push(`左侧门柱装饰替换为 ${refPhrase(i, pl.name)}样式。`)
    }
    if (pr) {
      const i = refIndex.get(`pillar:${pr.name}`)
      lines.push(`右侧门柱装饰替换为 ${refPhrase(i, pr.name)}样式。`)
    }
  }

  const lock = findItem(catalog, 'lock', sel.lock)
  if (lock) {
    const i = refIndex.get(`lock:${lock.name}`)
    lines.push(`门锁拉手替换为 ${refPhrase(i, lock.name)}款式，成对安装在两扇大门中央。`)
  }

  const color = findItem(catalog, 'color', sel.color)
  if (color) {
    const i = refIndex.get(`color:${color.name}`)
    lines.push(`整体门面颜色改为 ${refPhrase(i, color.name)}表面质感与色调。`)
  }

  const slotList = configuredSlots(sel, face)
  if (slotList.length) {
    lines.push(
      `门面压花（浮雕花纹）按位置处理（门左右轴对称，下面只列出左半 ${leftHalfCount(face)} 扇，右半请做成完全对称的镜像）：`,
    )
    for (const s of slotList) {
      const item = findItem(catalog, 'emboss', sel.emboss[slotId(s)])
      if (!item) continue
      const i = refIndex.get(`emboss:${item.name}`)
      // 上下联动：同门扇的 top/bottom 是同一份配置，合并成一条描述
      const hasTop = slotList.some((x) => x.leaf === s.leaf && x.zone === 'top')
      const hasBottom = slotList.some((x) => x.leaf === s.leaf && x.zone === 'bottom')
      if (s.zone === 'bottom' && hasTop) continue
      const linked = s.zone === 'top' && hasBottom
      if (linked) {
        lines.push(
          `- 第 ${s.leaf} 扇门的上、下区域（上下对称，用同一款纹样），按 ${refPhrase(i, item.name)} 的纹样精修。`,
        )
      } else if (i) {
        lines.push(
          `- 第 ${s.leaf} 扇门的${zoneName[s.zone]}区域，按 ${refPhrase(i, item.name)} 的纹样精修。`,
        )
      } else {
        // 参考图超限没发出去的：合成底图里已经画好了，让 AI 保持并写实化
        lines.push(
          `- 第 ${s.leaf} 扇门的${zoneName[s.zone]}区域，底图上已是「${cleanName(item.name)}」压花纹样，保持该纹样并做写实化处理。`,
        )
      }
    }
  }

  lines.push(
    '所有纹样保持与原门一致的玫瑰金/古铜色铜质浮雕质感、光影与景深，沿中轴线对称。照片级写实，超清细节。无文字、无水印、无多余标签。',
  )
  return lines.join('\n')
}
