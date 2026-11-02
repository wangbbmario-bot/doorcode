import { describe, it, expect } from 'vitest'
import { buildConfigEntries, clearConfigEntry, pickEmboss } from '../src/lib/selection'
import type { Catalog, Selection, Slot } from '../src/types'

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
  face: { key: 'face', label: '门面', thumbRatio: 1, items: [item('六扇门'), item('八扇门')] },
  head: { key: 'head', label: '门头', thumbRatio: 4, items: [item('皇冠小门头')] },
  pillar: { key: 'pillar', label: '门柱', thumbRatio: 1, items: [item('大边框01')] },
  lock: { key: 'lock', label: '门锁', thumbRatio: 1, items: [item('1816拉手')] },
  color: { key: 'color', label: '颜色', thumbRatio: 1, items: [item('镜面玫瑰金')] },
  emboss: {
    key: 'emboss',
    label: '压花',
    thumbRatio: 1,
    items: [item('几何凹槽'), item('A04囍字')],
  },
}

const baseSel: Selection = {
  face: '六扇门',
  head: null,
  pillarL: null,
  pillarR: null,
  lock: null,
  color: null,
  emboss: {},
}

const fullSel: Selection = {
  face: '六扇门',
  head: '皇冠小门头',
  pillarL: '大边框01',
  pillarR: '大边框01',
  lock: '1816拉手',
  color: '镜面玫瑰金',
  emboss: { '3:top': 'A04囍字', '3:mid': '几何凹槽' },
}

describe('需求3：我的配置清单', () => {
  it('只配置门面时只列出门面', () => {
    const e = buildConfigEntries(baseSel, catalog)
    expect(e).toHaveLength(1)
    expect(e[0].group).toBe('face')
    expect(e[0].label).toBe('门面')
    expect(e[0].value).toBe('六扇门')
  })

  it('完整配置时列出 6 类，压花按槽位逐条列出', () => {
    const e = buildConfigEntries(fullSel, catalog)
    expect(e.map((x) => x.group)).toEqual([
      'face',
      'head',
      'pillar',
      'lock',
      'color',
      'emboss',
      'emboss',
    ])
    expect(e.map((x) => x.label)).toEqual([
      '门面',
      '门头',
      '门柱',
      '门锁',
      '颜色',
      '压花',
      '压花',
    ])
  })

  it('压花项带「第 N 扇 · 上/中/下」说明', () => {
    const e = buildConfigEntries(fullSel, catalog)
    const emb = e.filter((x) => x.group === 'emboss')
    expect(emb[0].detail).toBe('第 3 扇 · 上')
    expect(emb[0].value).toBe('A04囍字')
    expect(emb[1].detail).toBe('第 3 扇 · 中')
    expect(emb[1].value).toBe('几何凹槽')
  })

  it('压花项的 key 唯一，可作为 React key', () => {
    const e = buildConfigEntries(fullSel, catalog)
    expect(new Set(e.map((x) => x.key)).size).toBe(e.length)
  })

  it('catalog 里找不到的素材不会出现在清单里', () => {
    const e = buildConfigEntries({ ...baseSel, head: '不存在的门头' }, catalog)
    expect(e.some((x) => x.group === 'head')).toBe(false)
  })
})

describe('需求1：取消已配置项', () => {
  const entries = (s: Selection) => buildConfigEntries(s, catalog)
  const by = (s: Selection, g: string) => entries(s).find((x) => x.group === g)!

  it('取消门头只清门头', () => {
    const next = clearConfigEntry(fullSel, by(fullSel, 'head'))
    expect(next.head).toBeNull()
    expect(next.pillarL).toBe('大边框01')
    expect(next.lock).toBe('1816拉手')
    expect(next.color).toBe('镜面玫瑰金')
  })

  it('取消门柱左右一起清', () => {
    const next = clearConfigEntry(fullSel, by(fullSel, 'pillar'))
    expect(next.pillarL).toBeNull()
    expect(next.pillarR).toBeNull()
  })

  it('取消门锁只清门锁', () => {
    const next = clearConfigEntry(fullSel, by(fullSel, 'lock'))
    expect(next.lock).toBeNull()
    expect(next.head).toBe('皇冠小门头')
  })

  it('取消颜色只清颜色', () => {
    const next = clearConfigEntry(fullSel, by(fullSel, 'color'))
    expect(next.color).toBeNull()
    expect(next.head).toBe('皇冠小门头')
  })

  it('取消门面会连带清空所有压花', () => {
    const next = clearConfigEntry(fullSel, by(fullSel, 'face'))
    expect(next.emboss).toEqual({})
    expect(next.head).toBe('皇冠小门头')
  })

  it('取消单个压花只清那一个槽位，其它压花保留', () => {
    const target = entries(fullSel).find((x) => x.detail === '第 3 扇 · 上')!
    const next = clearConfigEntry(fullSel, target)
    expect(next.emboss['3:top']).toBeUndefined()
    expect(next.emboss['3:mid']).toBe('几何凹槽')
  })
})

describe('需求2：压花必须先选位置再选类型', () => {
  const s1: Slot = { leaf: 3, zone: 'top' }
  const s2: Slot = { leaf: 3, zone: 'mid' }

  it('没选位置时选压花不生效（保持原样）', () => {
    const r = pickEmboss(baseSel, [], '几何凹槽')
    expect(r.sel.emboss).toEqual({})
    expect(r.slots).toEqual([])
  })

  it('选好位置后应用压花', () => {
    const r = pickEmboss(baseSel, [s1], '几何凹槽')
    expect(r.sel.emboss['3:top']).toBe('几何凹槽')
  })

  it('可以一次应用到多个已选位置（连选上中下）', () => {
    const r = pickEmboss(baseSel, [s1, s2], '几何凹槽')
    expect(r.sel.emboss['3:top']).toBe('几何凹槽')
    expect(r.sel.emboss['3:mid']).toBe('几何凹槽')
  })

  it('应用后重置待选位置，避免选完压花不知道落到哪', () => {
    const r = pickEmboss(baseSel, [s1, s2], '几何凹槽')
    expect(r.slots).toEqual([])
  })

  it('未选位置时不会误改已有配置', () => {
    const r = pickEmboss(fullSel, [], '几何凹槽')
    expect(r.sel).toBe(fullSel)
    expect(r.sel.emboss['3:top']).toBe('A04囍字')
  })

  it('应用后清单里能看到刚配的位置', () => {
    const r = pickEmboss(baseSel, [s1], '几何凹槽')
    const e = buildConfigEntries(r.sel, catalog)
    expect(e.find((x) => x.group === 'emboss')?.detail).toBe('第 3 扇 · 上')
  })
})
