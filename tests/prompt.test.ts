import { describe, it, expect } from 'vitest'
import { cleanName, buildPrompt } from '../src/lib/compose'
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

describe('cleanName（BUG: ARK 输入审核误杀产品型号编号）', () => {
  it('剥掉 XDD-xxxx 编号', () => {
    expect(cleanName('XDD-1801皇冠小门头')).toBe('皇冠小门头')
    expect(cleanName('XDD-15011帝王边框')).toBe('帝王边框')
  })

  it('剥掉开头纯数字编号与材质后缀', () => {
    expect(cleanName('1816红古铜_正宗304')).toBe('红古铜')
    expect(cleanName('1819本色_正宗304')).toBe('本色')
    expect(cleanName('9021太空灰长款')).toBe('太空灰长款')
  })

  it('中文名原样保留', () => {
    expect(cleanName('几何凹槽')).toBe('几何凹槽')
    expect(cleanName('镜面玫瑰金')).toBe('镜面玫瑰金')
  })

  it('纯编号素材（A01/B10/K01）被剥成空串', () => {
    expect(cleanName('A01')).toBe('')
    expect(cleanName('B10')).toBe('')
    expect(cleanName('K01')).toBe('')
  })

  it('结果里不含任何 3 位以上数字', () => {
    for (const n of [
      'XDD-1801皇冠小门头',
      '1816红古铜_正宗304',
      '9021太空灰长款',
      '1.2厚实鸭蛋拉手本色',
      '304立体金钱玫瑰金无指纹',
      '8K喷砂哑光',
    ]) {
      expect(cleanName(n)).not.toMatch(/\d{3,}/)
    }
  })

  it('剥掉材质后缀后仍保留可读描述', () => {
    expect(cleanName('304立体金钱玫瑰金无指纹')).toContain('立体金钱')
    expect(cleanName('1.2厚实鸭蛋拉手本色')).toContain('厚实鸭蛋拉手')
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

  it('保留可读中文描述', () => {
    expect(prompt).toContain('皇冠小门头')
    expect(prompt).toContain('几何凹槽')
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

  it('压花按「门扇号 → 上中下」排序', () => {
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
    const i1t = p.indexOf('第 1 扇门的上部区域')
    const i1b = p.indexOf('第 1 扇门的下部区域')
    const i2b = p.indexOf('第 2 扇门的下部区域')
    expect(i1t).toBeGreaterThan(-1)
    expect(i1t).toBeLessThan(i1b)
    expect(i1b).toBeLessThan(i2b)
  })
})
