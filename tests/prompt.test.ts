import { describe, it, expect } from 'vitest'
import { hasAssetName, buildPrompt } from '../src/lib/compose'
import type { Catalog, FaceSpec, Selection } from '../src/types'

const item = (name: string, group: string) => ({
  name,
  thumb: 't',
  prev: 'p',
  w: 100,
  h: 100,
  ratio: 1,
  thumbRatio: 1,
  group,
})

const catalog: Catalog = {
  head: { key: 'head', label: '门头', thumbRatio: 4, items: [item('XDD-1801皇冠小门头', 'head')] },
  pillar: { key: 'pillar', label: '门柱', thumbRatio: 1, items: [item('XDD-1601大边框01', 'pillar')] },
  lock: { key: 'lock', label: '门锁', thumbRatio: 1, items: [item('1816红古铜_正宗304', 'lock')] },
  color: { key: 'color', label: '颜色', thumbRatio: 1, items: [item('镜面玫瑰金', 'color')] },
  emboss: {
    key: 'emboss',
    label: '压花',
    thumbRatio: 1,
    items: [item('几何凹槽', 'emboss'), item('XDD-101', 'emboss')],
  },
  face: { key: 'face', label: '门面', thumbRatio: 1, items: [] },
}

const mkLeaves = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    i: i + 1,
    x0: i / n,
    x1: (i + 1) / n,
    zones: {
      top: { y0: 0.28, y1: 0.5 },
      mid: { y0: 0.5, y1: 0.7 },
      bottom: { y0: 0.7, y1: 0.92 },
    },
  }))

const face = {
  key: '六扇门',
  w: 2508,
  h: 1672,
  leaves: mkLeaves(6),
  frame: { x0: 0.13, y0: 0.06, x1: 0.87, y1: 0.92 },
  doorTop: 0.285,
  doorBottom: 0.927,
  headBox: { x0: 0, y0: 0, x1: 1, y1: 1 },
  pillarL: { x0: 0, y0: 0, x1: 0.1, y1: 1 },
  pillarR: { x0: 0.9, y0: 0, x1: 1, y1: 1 },
  lockL: { x0: 0.46, y0: 0.5, x1: 0.48, y1: 0.7 },
  lockR: { x0: 0.52, y0: 0.5, x1: 0.54, y1: 0.7 },
  thumb: 't',
  prev: 'p',
} as unknown as FaceSpec

describe('hasAssetName（prompt 里不能出现素材名）', () => {
  const names = ['XDD-1805事事顺心门头', 'XDD-1603三生有幸', '818灰红古铜', '320加高上下加小模欧式花纹']

  it('能识别出文本里的素材名', () => {
    expect(hasAssetName('门头替换为 Image 2 所示的「事事顺心门头」样式', names)).toBe(true)
    expect(hasAssetName('Image 2 所示的横向铜质花纹装饰带样式', names)).toBe(false)
  })

  it('剥掉 XDD 编号后的名字也能识别', () => {
    expect(hasAssetName('三生有幸', names)).toBe(true)
  })

  it('过短的名字不误报（如 A01 这种纯编号）', () => {
    expect(hasAssetName('A01 门头', ['A01'])).toBe(false)
  })
})

describe('buildPrompt', () => {
  const sel: Selection = {
    face: '六扇门',
    head: 'XDD-1801皇冠小门头',
    pillarL: 'XDD-1601大边框01',
    pillarR: 'XDD-1601大边框01',
    lock: '1816红古铜_正宗304',
    color: '镜面玫瑰金',
    emboss: { '3:top': '几何凹槽', '3:mid': '几何凹槽' },
  }
  const refIndex = new Map([
    ['head:XDD-1801皇冠小门头', 2],
    ['pillar:XDD-1601大边框01', 3],
    ['lock:1816红古铜_正宗304', 4],
    ['color:镜面玫瑰金', 5],
    ['emboss:几何凹槽', 6],
  ])

  const prompt = buildPrompt(face, sel, catalog, refIndex)

  it('不包含任何产品型号编号（否则 ARK 400 误杀）', () => {
    expect(prompt).not.toContain('XDD-1801')
    expect(prompt).not.toContain('XDD-1601')
    expect(prompt).not.toContain('1816')
    expect(prompt).not.toMatch(/\b\d{3,}\b/)
  })

  it('用 Image N 引用素材，而不是型号', () => {
    expect(prompt).toContain('Image 2')
    expect(prompt).toContain('Image 6')
  })

  it('描述了每个替换项的位置', () => {
    expect(prompt).toContain('门头')
    expect(prompt).toContain('门柱')
    expect(prompt).toContain('门锁')
    expect(prompt).toContain('颜色')
    expect(prompt).toContain('第 3 扇门的上部区域')
    expect(prompt).toContain('第 3 扇门的中部区域')
  })

  it('prompt 里不出现任何素材中文名（模型会把名字画成画面文字）', () => {
    // 实测踩过：「事事顺心门头」被画到了门楣上
    expect(prompt).not.toContain('皇冠小门头')
    expect(prompt).not.toContain('几何凹槽')
    // 一律改用 Image N 引用
    expect(prompt).toContain('Image 2')
  })

  it('prompt 里不出现任何型号编号（ARK 输入审核会误杀）', () => {
    expect(prompt).not.toMatch(/XDD[-_]?\d+/i)
    expect(prompt).not.toMatch(/\d{3,}/)
  })

  it('包含写实与无水印要求', () => {
    expect(prompt).toContain('写实')
    expect(prompt).toContain('无水印')
  })
})

describe('buildPrompt 必须包含所有已配置的压花（不依赖待选位置）', () => {
  it('应用后待选区清零，prompt 里仍要有压花描述', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '3:top': '几何凹槽', '3:mid': '几何凹槽' },
    }
    const refIndex = new Map([['emboss:几何凹槽', 2]])
    const p = buildPrompt(face, sel, catalog, refIndex)
    expect(p).toContain('第 3 扇门的上部区域')
    expect(p).toContain('第 3 扇门的中部区域')
  })

  it('左右对称：只描述左半，右半由模型镜像', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '3:top': '几何凹槽', '4:mid': 'XDD-101' },
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    expect(p).toContain('第 3 扇门的上部区域')
    // 第 4 扇在右半 -> 不应单独描述
    expect(p).not.toContain('第 4 扇门的中部区域')
    // 要明确告诉模型右半做镜像
    expect(p).toContain('左右轴对称')
    expect(p).toContain('左半 3 扇')
    expect(p).toContain('镜像')
  })

  it('压花按「门扇号 → 上中下」排序，上下对称合并成一条', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '2:bottom': '几何凹槽', '1:bottom': '几何凹槽', '1:top': 'XDD-101' },
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    // 第 1 扇上+下是同一份配置 -> 合并成一条
    const i1 = p.indexOf('第 1 扇门的上、下区域')
    const i2 = p.indexOf('第 2 扇门的下部区域')
    expect(i1).toBeGreaterThan(-1)
    expect(i1).toBeLessThan(i2)
    // 不再单独描述上部/下部两条
    expect(p).not.toContain('第 1 扇门的上部区域')
    expect(p).not.toContain('第 1 扇门的下部区域')
  })

  it('上/下合并时说明是上下对称、用同一款纹样', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '1:top': 'XDD-101', '1:bottom': 'XDD-101' },
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    expect(p).toContain('上、下区域')
    expect(p).toContain('上下对称')
    expect(p).toContain('同一款纹样')
  })

  it('写明门扇数与左右对称关系（防止 AI 改变门扇数量）', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: {},
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    expect(p).toContain('本门共 6 扇')
    expect(p).toContain('左右各 3 扇')
    expect(p).toContain('必须严格对称')
  })

  it('写明三个部件的形态与位置（结构约束）', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: {},
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    expect(p).toContain('门楣上是一条通宽的横向装饰带')
    expect(p).toContain('门框左右两侧各有一条通高的细长竖条装饰')
    expect(p).toContain('一对成对的拉手')
    expect(p).toContain('以 Image 1 为准')
  })

  it('有压花时写明分区面积占比与留白间隙', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '1:mid': 'XDD-101' },
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    expect(p).toContain('顶部一条窄饰带约占门扇面积 10%')
    expect(p).toContain('中部主纹样区约占 38%')
    expect(p).toContain('底部一块小饰块约占 13%')
    expect(p).toContain('留白间隙')
    expect(p).toContain('不要把纹样连成一片')
  })

  it('没有压花时不写分区比例（避免描述不存在的装饰）', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: {},
    }
    const p = buildPrompt(face, sel, catalog, new Map())
    expect(p).not.toContain('压花分区与比例')
  })
})
