import { describe, it, expect } from 'vitest'
import {
  toggleSlot,
  applyEmboss,
  clearEmboss,
  toggleChoice,
  switchFace,
  computeWindow,
  computeGrid,
  thumbHeight,
} from '../src/lib/selection'
import type { Slot } from '../src/types'

describe('槽位选择（BUG: 同一扇门可连续选上/中/下）', () => {
  const top: Slot = { leaf: 3, zone: 'top' }
  const mid: Slot = { leaf: 3, zone: 'mid' }
  const bottom: Slot = { leaf: 3, zone: 'bottom' }
  const other: Slot = { leaf: 4, zone: 'mid' }

  it('点一次是选中', () => {
    expect(toggleSlot([], top)).toEqual([top])
  })

  it('再点一次是取消', () => {
    expect(toggleSlot([top], top)).toEqual([])
  })

  it('可以连续选中同一扇门的上中下三个位置', () => {
    let s = toggleSlot([], top)
    s = toggleSlot(s, mid)
    s = toggleSlot(s, bottom)
    expect(s).toHaveLength(3)
    expect(s.map((x) => x.zone)).toEqual(['top', 'mid', 'bottom'])
  })

  it('不同门扇的位置互不影响', () => {
    const s = toggleSlot(toggleSlot([], top), other)
    expect(s).toHaveLength(2)
    expect(toggleSlot(s, other)).toEqual([top])
  })
})

describe('压花应用与取消（BUG6: 已选压花右上角 X）', () => {
  const s1: Slot = { leaf: 3, zone: 'top' }
  const s2: Slot = { leaf: 3, zone: 'mid' }
  const s3: Slot = { leaf: 3, zone: 'bottom' }

  it('一次压花应用到所有已选槽位', () => {
    const e = applyEmboss({}, [s1, s2, s3], '几何凹槽')
    expect(e).toEqual({ '3:top': '几何凹槽', '3:mid': '几何凹槽', '3:bottom': '几何凹槽' })
  })

  it('X 取消只清掉那一个位置，其他位置不受影响', () => {
    const e = applyEmboss({}, [s1, s2, s3], '几何凹槽')
    const after = clearEmboss(e, s2)
    expect(after['3:top']).toBe('几何凹槽')
    expect(after['3:mid']).toBeUndefined()
    expect(after['3:bottom']).toBe('几何凹槽')
  })

  it('取消不存在的压花不改变对象引用（避免无谓重渲染）', () => {
    const e = { '3:top': 'x' }
    expect(clearEmboss(e, s2)).toBe(e)
  })

  it('取消后槽位仍在已选列表里，可以直接换别的压花', () => {
    const slots = [s1, s2]
    const e = applyEmboss({}, slots, '旧压花')
    const cleared = clearEmboss(e, s1)
    expect(cleared['3:top']).toBeUndefined()
    expect(cleared['3:mid']).toBe('旧压花')
    // 槽位仍在已选列表 -> 直接点新压花即可替换（只影响已选槽位）
    const re = applyEmboss(cleared, [s1], '新压花')
    expect(re['3:top']).toBe('新压花')
    expect(re['3:mid']).toBe('旧压花')
  })
})

describe('元素选择', () => {
  it('同一点击取消，再点恢复', () => {
    expect(toggleChoice('XDD-1801', 'XDD-1801')).toBeNull()
    expect(toggleChoice(null, 'XDD-1801')).toBe('XDD-1801')
  })

  it('切换门面时清空已选压花', () => {
    const sel = {
      face: '六扇门',
      head: 'a',
      pillarL: 'b',
      pillarR: 'b',
      lock: 'c',
      color: 'd',
      emboss: { '3:top': 'e' },
    }
    const next = switchFace(sel, '八扇门')
    expect(next.face).toBe('八扇门')
    expect(next.emboss).toEqual({})
    expect(next.head).toBe('a')
  })
})

describe('虚拟滚动窗口（BUG: 上千张缩略图不能一次性挂载）', () => {
  const TOTAL = 1324
  const COLS = 6
  const ROW_H = 141
  const ROWS = Math.ceil(TOTAL / COLS)

  it('首屏只渲染视口附近的节点', () => {
    const { start, end } = computeWindow(0, 600, ROW_H, ROWS, COLS, TOTAL)
    expect(end - start).toBeLessThan(60)
    expect(start).toBe(0)
  })

  it('滚动到中段时窗口跟着移动', () => {
    const { start, end } = computeWindow(30000, 600, ROW_H, ROWS, COLS, TOTAL)
    expect(start).toBeGreaterThan(0)
    expect(end - start).toBeLessThan(80)
    expect(end).toBeLessThanOrEqual(TOTAL)
  })

  it('滚到底部时窗口到达末尾且不越界', () => {
    const totalH = ROWS * ROW_H
    const { start, end } = computeWindow(totalH, 600, ROW_H, ROWS, COLS, TOTAL)
    expect(end).toBe(TOTAL)
    expect(start).toBeLessThanOrEqual(TOTAL)
    expect(end - start).toBeLessThan(80)
  })

  it('任何位置的渲染节点数都远小于总量', () => {
    for (const top of [0, 5000, 20000, 40000, 60000]) {
      const { start, end } = computeWindow(top, 600, ROW_H, ROWS, COLS, TOTAL)
      expect(end - start).toBeLessThan(TOTAL / 10)
    }
  })

  it('空集合不报错', () => {
    expect(computeWindow(0, 600, ROW_H, 0, COLS, 0)).toEqual({ start: 0, end: 0 })
  })
})

describe('网格列计算', () => {
  it('右栏 740px -> 5 列，每格 >= 116px', () => {
    const { cols, cellW } = computeGrid(740, 116, 8, 12)
    expect(cols).toBe(5)
    expect(cellW).toBeGreaterThanOrEqual(116)
  })

  it('窄栏（314px）也不会算出 0 列', () => {
    const { cols, cellW } = computeGrid(314, 116, 8, 12)
    expect(cols).toBeGreaterThanOrEqual(1)
    expect(cellW).toBeGreaterThan(0)
  })

  it('宽度不足时退化为 1 列', () => {
    expect(computeGrid(10, 116, 8, 12).cols).toBe(1)
  })
})

describe('缩略图高度（BUG2/3/4/5: 各类素材形状不同）', () => {
  it('方形素材（门面/颜色）显示为正方形', () => {
    expect(thumbHeight(120, 1)).toBe(120)
  })

  it('横条素材（门头）显示为扁横条', () => {
    expect(thumbHeight(120, 4)).toBe(30)
  })

  it('纵向细条不会把单元撑得过高（默认封顶 1 倍）', () => {
    expect(thumbHeight(120, 0.25)).toBe(120)
  })

  it('给了 maxH 就按真实比例给高度（门锁 1:2.4）', () => {
    expect(thumbHeight(120, 0.42, 3)).toBe(286)
  })

  it('真实高度超过 maxH 时封顶（门柱 1:10 不会撑爆一屏）', () => {
    // 120/0.1 = 1200 远超上限 4*120=480
    expect(thumbHeight(120, 0.1, 4)).toBe(480)
  })

  it('maxH 不会反过来把横向素材压矮', () => {
    expect(thumbHeight(120, 4, 1)).toBe(30)
    expect(thumbHeight(120, 1, 4)).toBe(120)
  })
})
