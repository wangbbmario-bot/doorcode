/**
 * Prompt 生成
 *
 * 两条硬约束：
 * 1. **prompt 里不出现任何素材中文名**。
 *    一是 ARK 输入审核会把产品型号编号（XDD-1801 / 1816 / A01 / 正宗304）
 *    误判为敏感标识（InputTextSensitiveContentDetected）；
 *    二是实测模型会把中文名当成画面内容直接画上去
 *    （「事事顺心门头」被画到了门楣上）。素材一律用 Image N 引用。
 * 2. 门扇分区与比例按画板实测值写死，避免 AI 重新设计结构。
 */
import type { Catalog, FaceSpec, Selection, Slot, ZoneKey } from '../../types'
import { slotId } from '../../types'
import { isLeftHalf, leftHalfCount } from '../selection'
import { findItem } from './draw'

const ZONE_ORDER: ZoneKey[] = ['top', 'mid', 'bottom']

/**
 * 检查一段文本里有没有素材名/型号编号。
 *
 * prompt 里绝不能出现它们：编号会被 ARK 输入审核误杀，
 * 中文名会被模型当成画面文字画出来。
 */
export function hasAssetName(text: string, names: string[]): boolean {
  return names.some((n) => {
    const label = n.replace(/^XDD[-_]?\d+/i, '').replace(/^[\d.]+/, '').trim()
    if (label.length < 2) return false
    if (/^[A-Za-z]{1,4}\d{1,4}$/.test(label)) return false // A01 / B10 / K01 纯编号
    return text.includes(label)
  })
}

/**
 * 素材在 prompt 里的引用：**只给 Image N 序号，不放素材中文名**。
 *
 * 为什么不用中文名 —— 实测踩过坑：写成「Image 2 所示的「事事顺心门头」样式」，
 * 模型会把「事事顺心门头」当成画面内容直接画到门楣上（生成了带字的错误效果图）。
 * img2img 任务里参考图已经包含全部样式信息，文字描述是多余的。
 * 附带好处：prompt 里不可能再出现产品型号编号，ARK 输入审核的误杀从根上避免。
 */
function refPhrase(i: number | undefined): string {
  return i ? `Image ${i}` : ''
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
  const half = leftHalfCount(face)

  lines.push(
    `Image 1 是已经按用户选择合成好的铜门底图（门面/压花/颜色/门头/门柱/门锁都已绘制在图上）。` +
      `请把它渲染成照片级写实的实拍效果图：保持门框、门楣、门柱结构、地面、整体比例和左右对称关系不变，` +
      `并按下面的参考图把对应部件的纹样细节精修到位。`,
  )

  // 结构约束：门扇数、三个部件的形态与位置 —— 防止 AI 重新设计或缩放底图
  lines.push(
    `【结构约束，务必保持】本门共 ${half * 2} 扇，左右各 ${half} 扇，必须严格对称。` +
      `门楣上是一条通宽的横向装饰带；门框左右两侧各有一条通高的细长竖条装饰；` +
      `两扇大门中央有一对成对的拉手（圆形底座 + 竖向拉手）。` +
      `它们的位置、大小、比例一律以 Image 1 为准，不得重新设计、缩放或增减。`,
  )

  const slotList = configuredSlots(sel, face)

  // 压花分区与比例（画板实测：单扇门面积 115×1103 为 100%）
  if (slotList.length) {
    lines.push(
      `【压花分区与比例】每扇门板上，顶部一条窄饰带约占门扇面积 10%，` +
        `中部主纹样区约占 38%，底部一块小饰块约占 13%，` +
        `其余约 39% 是饰带之间的留白间隙与边框。` +
        `浮雕只落在指定的那一段，三段之间要留出明显的横向间隙，不要把纹样连成一片；` +
        `每条饰带只占门扇中部约三分之二的宽度，左右两侧留边，不要铺满整扇门。`,
    )
  }

  const head = findItem(catalog, 'head', sel.head)
  if (head) {
    const i = refIndex.get(`head:${head.name}`)
    lines.push(`门头（门楣横梁装饰）替换为 ${refPhrase(i)} 所示的横向铜质花纹装饰带样式。`)
  }

  const pl = findItem(catalog, 'pillar', sel.pillarL)
  const pr = findItem(catalog, 'pillar', sel.pillarR)
  if (pl && pr && pl.name === pr.name) {
    const i = refIndex.get(`pillar:${pl.name}`)
    lines.push(`左右门柱装饰替换为 ${refPhrase(i)} 所示的通高细长竖条花纹样式。`)
  } else {
    if (pl) {
      const i = refIndex.get(`pillar:${pl.name}`)
      lines.push(`左侧门柱装饰替换为 ${refPhrase(i)} 所示的通高细长竖条花纹样式。`)
    }
    if (pr) {
      const i = refIndex.get(`pillar:${pr.name}`)
      lines.push(`右侧门柱装饰替换为 ${refPhrase(i)} 所示的通高细长竖条花纹样式。`)
    }
  }

  const lock = findItem(catalog, 'lock', sel.lock)
  if (lock) {
    const i = refIndex.get(`lock:${lock.name}`)
    lines.push(`门锁拉手替换为 ${refPhrase(i)} 所示款式，成对安装在两扇大门中央。`)
  }

  const color = findItem(catalog, 'color', sel.color)
  if (color) {
    const i = refIndex.get(`color:${color.name}`)
    lines.push(`整体门面颜色改为 ${refPhrase(i)} 所示的表面质感与色调。`)
  }

  if (slotList.length) {
    lines.push(
      `门面压花（浮雕花纹）按位置处理（门左右轴对称，下面只列出左半 ${half} 扇，右半请做成完全对称的镜像）：`,
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
          `- 第 ${s.leaf} 扇门的上、下区域（上下对称，用同一款纹样），按 ${refPhrase(i)} 所示的浮雕花纹精修。`,
        )
      } else if (i) {
        lines.push(
          `- 第 ${s.leaf} 扇门的${zoneName[s.zone]}区域，按 ${refPhrase(i)} 所示的浮雕花纹精修。`,
        )
      } else {
        // 参考图超限没发出去的：合成底图里已经画好了，让 AI 保持并写实化
        lines.push(
          `- 第 ${s.leaf} 扇门的${zoneName[s.zone]}区域，底图上已经画好该处的压花纹样，保持它并做写实化处理。`,
        )
      }
    }
  }

  lines.push(
    '所有纹样保持与原门一致的玫瑰金/古铜色铜质浮雕质感、光影与景深，沿中轴线对称。照片级写实，超清细节。无文字、无水印、无多余标签。',
  )
  return lines.join('\n')
}
