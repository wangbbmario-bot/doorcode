import { describe, it, expect } from 'vitest'
import { planRefs, MAX_REF_IMAGES } from '../src/lib/compose'
import type { Catalog, Selection } from '../src/types'

const item = (name: string) => ({
  name,
  thumb: 't',
  prev: 'p',
  w: 100,
  h: 100,
  ratio: 1,
  thumbRatio: 1,
})

const catalog: Catalog = {
  face: { key: 'face', label: '门面', thumbRatio: 1, items: [item('六扇门')] },
  head: { key: 'head', label: '门头', thumbRatio: 4, items: [item('皇冠小门头')] },
  pillar: { key: 'pillar', label: '门柱', thumbRatio: 1, items: [item('大边框01')] },
  lock: { key: 'lock', label: '门锁', thumbRatio: 1, items: [item('1816拉手')] },
  color: { key: 'color', label: '颜色', thumbRatio: 1, items: [item('镜面玫瑰金')] },
  emboss: {
    key: 'emboss',
    label: '压花',
    thumbRatio: 1,
    items: [
      item('A01'),
      item('A02'),
      item('A03'),
      item('A04'),
      item('A05'),
      item('A06'),
      item('A07'),
      item('A08'),
      item('A09'),
      item('A10'),
      item('A11'),
      item('A12'),
    ],
  },
}

/** 模拟用户把 6 扇 × 3 段 = 18 个位置全配了 */
const allSlotsSel = (): Selection => {
  const emboss: Record<string, string> = {}
  const names = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12']
  for (let leaf = 1; leaf <= 6; leaf++) {
    emboss[`${leaf}:top`] = names[(leaf * 3) % names.length]
    emboss[`${leaf}:mid`] = names[(leaf * 3 + 1) % names.length]
    emboss[`${leaf}:bottom`] = names[(leaf * 3 + 2) % names.length]
  }
  return {
    face: '六扇门',
    head: '皇冠小门头',
    pillarL: '大边框01',
    pillarR: '大边框01',
    lock: '1816拉手',
    color: '镜面玫瑰金',
    emboss,
  }
}

describe('参考图上限（Seedream Flash 最多 10 张，含底图）', () => {
  it('上限常量是 9（10 - 合成底图 1）', () => {
    expect(MAX_REF_IMAGES).toBe(9)
  })

  it('全配 18 个压花位置 + 4 类部件，参考图仍不超过 9 张', () => {
    const p = planRefs(allSlotsSel(), catalog)
    expect(p.sent.length).toBeLessThanOrEqual(MAX_REF_IMAGES)
    expect(p.sent.length + 1).toBeLessThanOrEqual(10)
  })

  it('部件类（门头/门柱/门锁/颜色）优先占名额', () => {
    const p = planRefs(allSlotsSel(), catalog)
    expect(p.sent).toContain('head:皇冠小门头')
    expect(p.sent).toContain('pillar:大边框01')
    expect(p.sent).toContain('lock:1816拉手')
    expect(p.sent).toContain('color:镜面玫瑰金')
  })

  it('同一样式的压花只占一个名额（去重）', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '1:top': 'A01', '2:top': 'A01', '3:top': 'A01', '1:mid': 'A01' },
    }
    const p = planRefs(sel, catalog)
    expect(p.sent.filter((k) => k.startsWith('emboss:')).length).toBe(1)
  })

  it('压花按位置顺序补足名额', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '3:mid': 'A05', '1:top': 'A01' },
    }
    const p = planRefs(sel, catalog)
    // 门扇号小的先发
    expect(p.sent[0]).toBe('emboss:A01')
    expect(p.sent[1]).toBe('emboss:A05')
  })

  it('超出上限的部分被标记为 dropped', () => {
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: {
        '1:top': 'A01', '1:mid': 'A02', '1:bottom': 'A03',
        '2:top': 'A04', '2:mid': 'A05', '2:bottom': 'A06',
        '3:top': 'A07', '3:mid': 'A08', '3:bottom': 'A09',
        '4:top': 'A10', '4:mid': 'A11', '4:bottom': 'A12',
      },
    }
    const p = planRefs(sel, catalog)
    expect(p.sent).toHaveLength(9)
    expect(p.dropped).toHaveLength(3)
    expect(p.dropped.every((k) => k.startsWith('emboss:'))).toBe(true)
  })

  it('没选任何东西时不产生参考图', () => {
    const p = planRefs(
      { face: '六扇门', head: null, pillarL: null, pillarR: null, lock: null, color: null, emboss: {} },
      catalog,
    )
    expect(p.sent).toEqual([])
    expect(p.dropped).toEqual([])
  })

  it('catalog 里不存在的素材不占名额', () => {
    const sel: Selection = {
      face: '六扇门',
      head: '不存在的门头',
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: {},
    }
    expect(planRefs(sel, catalog).sent).toEqual([])
  })
})
