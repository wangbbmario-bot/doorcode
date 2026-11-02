import { describe, it, expect } from 'vitest'
import { reducer, initialState, actions, partToCategory } from '../src/state/reducer'
import type { AppState } from '../src/state/reducer'
import type { Faces, Selection } from '../src/types'
import type { ConfigEntry } from '../src/lib/selection'

function mkFace(n: number) {
  return {
    key: `${n}扇门`,
    w: 2508,
    h: 1672,
    frame: { x0: 0.13, y0: 0.06, x1: 0.87, y1: 0.92 },
    doorTop: 0.28,
    doorBottom: 0.92,
    leaves: Array.from({ length: n }, (_, i) => ({
      i: i + 1,
      x0: i / n,
      x1: (i + 1) / n,
      zones: {
        top: { y0: 0.28, y1: 0.36 },
        mid: { y0: 0.36, y1: 0.84 },
        bottom: { y0: 0.84, y1: 0.92 },
      },
    })),
    headBox: { x0: 0, y0: 0, x1: 1, y1: 1 },
    pillarL: { x0: 0, y0: 0, x1: 0.1, y1: 1 },
    pillarR: { x0: 0.9, y0: 0, x1: 1, y1: 1 },
    lockL: { x0: 0.46, y0: 0.5, x1: 0.48, y1: 0.7 },
    lockR: { x0: 0.52, y0: 0.5, x1: 0.54, y1: 0.7 },
    thumb: 't',
    prev: 'p',
  }
}

const FACES = { 六扇门: mkFace(6), 八扇门: mkFace(8) } as unknown as Faces

const item = (name: string) => ({
  name,
  thumb: 't',
  prev: 'p',
  w: 1,
  h: 1,
  ratio: 1,
  thumbRatio: 1,
})

const baseState = (over: Partial<AppState> = {}): AppState => ({
  ...initialState,
  catalog: {
    face: { key: 'face', label: '门面', thumbRatio: 1, items: [item('六扇门'), item('八扇门')] },
    head: { key: 'head', label: '门头', thumbRatio: 4, items: [item('门头A')] },
    pillar: { key: 'pillar', label: '门柱', thumbRatio: 1, items: [item('门柱A')] },
    lock: { key: 'lock', label: '门锁', thumbRatio: 1, items: [item('门锁A')] },
    color: { key: 'color', label: '颜色', thumbRatio: 1, items: [item('玫瑰金')] },
    emboss: { key: 'emboss', label: '压花', thumbRatio: 1, items: [item('A01')] },
  } as never,
  faces: FACES,
  ready: true,
  ...over,
})

describe('reducer · boot 初始化', () => {
  it('无历史时用默认配置，ready=true', () => {
    const s = reducer(baseState(), actions.boot(baseState().catalog!, FACES, null))
    expect(s.ready).toBe(true)
    expect(s.sel.emboss).toEqual({})
  })

  it('有历史时恢复配置', () => {
    const restored = {
      sel: { ...initialState.sel, face: '八扇门', head: '门头A' },
      slots: [{ leaf: 1, zone: 'top' as const }],
    }
    const s = reducer(baseState(), actions.boot(baseState().catalog!, FACES, restored))
    expect(s.sel.face).toBe('八扇门')
    expect(s.sel.head).toBe('门头A')
    expect(s.slots).toHaveLength(1)
  })

  it('恢复时清掉右半的旧压花数据（左右对称模型）', () => {
    const restored = {
      sel: { ...initialState.sel, face: '六扇门', emboss: { '2:top': 'A01', '5:top': 'A01' } },
      slots: [],
    }
    const s = reducer(baseState(), actions.boot(baseState().catalog!, FACES, restored))
    expect(s.sel.emboss).toEqual({ '2:top': 'A01' })
  })

  it('历史里的门面不存在时忽略历史', () => {
    const restored = { sel: { ...initialState.sel, face: '不存在的门' }, slots: [] }
    const s = reducer(baseState(), actions.boot(baseState().catalog!, FACES, restored))
    expect(s.sel.face).toBe('六扇门')
  })
})

describe('reducer · 槽位与压花', () => {
  it('toggleSlot 选中 / 取消', () => {
    let s = baseState()
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'mid' }))
    expect(s.slots).toHaveLength(1)
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'mid' }))
    expect(s.slots).toHaveLength(0)
  })

  it('没选位置时选压花 -> 报错且不改配置', () => {
    const s = reducer(baseState(), actions.pickAsset('emboss', item('A01')))
    expect(s.error).toContain('请先在左侧点击')
    expect(s.sel.emboss).toEqual({})
  })

  it('选好位置后选压花 -> 应用到所有已选位置并重置待选', () => {
    let s = baseState()
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'top' }))
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'mid' }))
    s = reducer(s, actions.pickAsset('emboss', item('A01')))
    expect(s.sel.emboss).toEqual({ '3:top': 'A01', '3:mid': 'A01' })
    expect(s.slots).toEqual([])
  })

  it('clearSlot 只清那一个位置', () => {
    let s = baseState()
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'top' }))
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'mid' }))
    s = reducer(s, actions.pickAsset('emboss', item('A01')))
    s = reducer(s, actions.clearSlot({ leaf: 3, zone: 'top' }))
    expect(s.sel.emboss['3:top']).toBeUndefined()
    expect(s.sel.emboss['3:mid']).toBe('A01')
  })
})

describe('reducer · 部件选择', () => {
  it('门头同一点击取消', () => {
    let s = reducer(baseState(), actions.pickAsset('head', item('门头A')))
    expect(s.sel.head).toBe('门头A')
    s = reducer(s, actions.pickAsset('head', item('门头A')))
    expect(s.sel.head).toBeNull()
  })

  it('门柱左右一起设 / 一起清', () => {
    let s = reducer(baseState(), actions.pickAsset('pillar', item('门柱A')))
    expect(s.sel.pillarL).toBe('门柱A')
    expect(s.sel.pillarR).toBe('门柱A')
    s = reducer(s, actions.clearPart('pillarL'))
    expect(s.sel.pillarL).toBeNull()
    expect(s.sel.pillarR).toBeNull()
  })

  it('clearPart 门头 / 门锁各自独立', () => {
    let s = reducer(baseState(), actions.pickAsset('head', item('门头A')))
    s = reducer(s, actions.pickAsset('lock', item('门锁A')))
    s = reducer(s, actions.clearPart('head'))
    expect(s.sel.head).toBeNull()
    expect(s.sel.lock).toBe('门锁A')
  })

  it('选门面会清空压花和待选位置', () => {
    let s = baseState()
    s = reducer(s, actions.toggleSlot({ leaf: 3, zone: 'mid' }))
    s = reducer(s, actions.pickAsset('emboss', item('A01')))
    s = reducer(s, actions.pickAsset('face', item('八扇门')))
    expect(s.sel.face).toBe('八扇门')
    expect(s.sel.emboss).toEqual({})
    expect(s.slots).toEqual([])
  })
})

describe('reducer · 配置清单与收藏', () => {
  const entry = (over: Partial<ConfigEntry> = {}): ConfigEntry => ({
    key: 'head',
    group: 'head',
    label: '门头',
    value: '门头A',
    ...over,
  })

  it('clearConfig 取消单个配置项', () => {
    let s = reducer(baseState(), actions.pickAsset('head', item('门头A')))
    s = reducer(s, actions.clearConfig(entry()))
    expect(s.sel.head).toBeNull()
  })

  it('clearAllConfig 清空所有但保留门面', () => {
    let s = baseState()
    s = reducer(s, actions.pickAsset('head', item('门头A')))
    s = reducer(s, actions.pickAsset('lock', item('门锁A')))
    s = reducer(s, actions.clearAllConfig())
    expect(s.sel.head).toBeNull()
    expect(s.sel.lock).toBeNull()
    expect(s.sel.face).toBe('六扇门')
  })

  it('toggleFav 加 / 取消收藏', () => {
    let s = reducer(baseState(), actions.toggleFav('emboss', 'A01'))
    expect(s.favs).toEqual(['emboss:A01'])
    s = reducer(s, actions.toggleFav('emboss', 'A01'))
    expect(s.favs).toEqual([])
  })

  it('setFavs 覆盖收藏列表', () => {
    const s = reducer(baseState(), actions.setFavs(['emboss:A01', 'head:门头A']))
    expect(s.favs).toHaveLength(2)
  })
})

describe('reducer · 历史套用 / 分栏 / 其它', () => {
  it('applyHistory 恢复整套配置', () => {
    const s = reducer(
      baseState(),
      actions.applyHistory({
        face: '八扇门',
        head: '门头A',
        pillarL: '门柱A',
        pillarR: '门柱A',
        lock: '门锁A',
        color: '玫瑰金',
        emboss: { '2:top': 'A01' },
      }),
    )
    expect(s.sel.face).toBe('八扇门')
    expect(s.sel.head).toBe('门头A')
    expect(s.sel.emboss).toEqual({ '2:top': 'A01' })
  })

  it('applyHistory 传 null 时不动配置', () => {
    const before = baseState()
    const s = reducer(before, actions.applyHistory(null))
    expect(s.sel).toBe(before.sel)
  })

  it('setSplit 限制在 20-80', () => {
    expect(reducer(baseState(), actions.setSplit(10)).split).toBe(20)
    expect(reducer(baseState(), actions.setSplit(95)).split).toBe(80)
    expect(reducer(baseState(), actions.setSplit(45)).split).toBe(45)
  })

  it('unknown action 返回原状态', () => {
    const before = baseState()
    expect(reducer(before, { type: 'xxx' } as never)).toBe(before)
  })

  it('partToCategory 映射正确', () => {
    expect(partToCategory('head')).toBe('head')
    expect(partToCategory('pillarL')).toBe('pillar')
    expect(partToCategory('pillarR')).toBe('pillar')
    expect(partToCategory('lockL')).toBe('lock')
  })
})
