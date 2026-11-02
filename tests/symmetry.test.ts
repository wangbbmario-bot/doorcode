import { describe, it, expect } from 'vitest'
import {
  leftHalfCount,
  isLeftHalf,
  mirrorLeaf,
  mirrorSlot,
  mirrorSlot as ms,
  pruneRightHalf,
  effectiveEmboss,
  buildConfigEntries,
} from '../src/lib/selection'
import { slotId } from '../src/types'
import type { FaceSpec, Selection } from '../src/types'

function makeFace(n: number): FaceSpec {
  const leaves = []
  for (let i = 1; i <= n; i++) {
    leaves.push({
      i,
      x0: (i - 1) / n,
      x1: i / n,
      zones: {
        top: { y0: 0.28, y1: 0.5 },
        mid: { y0: 0.5, y1: 0.7 },
        bottom: { y0: 0.7, y1: 0.92 },
      },
    })
  }
  return {
    key: `${n}扇门`,
    w: 2508,
    h: 1672,
    frame: { x0: 0.13, y0: 0.06, x1: 0.87, y1: 0.92 },
    doorTop: 0.28,
    doorBottom: 0.92,
    leaves,
    headBox: { x0: 0, y0: 0, x1: 1, y1: 1 },
    pillarL: { x0: 0, y0: 0, x1: 0.1, y1: 1 },
    pillarR: { x0: 0.9, y0: 0, x1: 1, y1: 1 },
    lockL: { x0: 0.46, y0: 0.5, x1: 0.48, y1: 0.7 },
    lockR: { x0: 0.52, y0: 0.5, x1: 0.54, y1: 0.7 },
    thumb: 't',
    prev: 'p',
  }
}

describe('左右轴对称：左半 / 右半划分', () => {
  it.each([
    [2, 1],
    [4, 2],
    [6, 3],
    [8, 4],
  ])('%i 扇门左半 %i 扇', (n, half) => {
    expect(leftHalfCount(makeFace(n))).toBe(half)
  })

  it('只有左半门扇可配置', () => {
    const f = makeFace(6)
    expect(isLeftHalf(f, 1)).toBe(true)
    expect(isLeftHalf(f, 3)).toBe(true)
    expect(isLeftHalf(f, 4)).toBe(false)
    expect(isLeftHalf(f, 6)).toBe(false)
  })

  it('镜像映射：第 i 扇 ↔ 第 N+1-i 扇', () => {
    const f = makeFace(6)
    expect(mirrorLeaf(f, 1)).toBe(6)
    expect(mirrorLeaf(f, 2)).toBe(5)
    expect(mirrorLeaf(f, 3)).toBe(4)
    expect(mirrorLeaf(f, 4)).toBe(3)
    expect(mirrorLeaf(f, 6)).toBe(1)
  })

  it('镜像槽位保留上/中/下', () => {
    const f = makeFace(4)
    expect(mirrorSlot(f, { leaf: 1, zone: 'top' })).toEqual({ leaf: 4, zone: 'top' })
    expect(ms(f, { leaf: 3, zone: 'bottom' })).toEqual({ leaf: 2, zone: 'bottom' })
  })
})

describe('压花只存左半，右半按镜像生效', () => {
  it('右半取左半镜像的压花', () => {
    const f = makeFace(6)
    const emboss = { '3:mid': '几何凹槽' }
    expect(effectiveEmboss(emboss, f, { leaf: 3, zone: 'mid' })).toBe('几何凹槽')
    expect(effectiveEmboss(emboss, f, { leaf: 4, zone: 'mid' })).toBe('几何凹槽')
    expect(effectiveEmboss(emboss, f, { leaf: 2, zone: 'mid' })).toBeUndefined()
  })

  it('pruneRightHalf 清掉早期版本存的右半数据', () => {
    const f = makeFace(6)
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '1:top': 'A', '2:top': 'B', '4:top': 'C', '5:top': 'D' },
    }
    const out = pruneRightHalf(sel, f)
    expect(Object.keys(out.emboss).sort()).toEqual(['1:top', '2:top'])
  })

  it('压花项的 key 仍用左半门扇号', () => {
    const f = makeFace(6)
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '3:mid': '几何凹槽' },
    }
    expect(pruneRightHalf(sel, f).emboss[slotId({ leaf: 3, zone: 'mid' })]).toBe('几何凹槽')
  })
})

describe('配置清单只列左半', () => {
  it('右半的压花不出现', () => {
    const f = makeFace(6)
    const catalog = {
      face: { key: 'face', label: '门面', thumbRatio: 1, items: [{ name: '六扇门', thumb: 't', prev: 'p', w: 1, h: 1, ratio: 1, thumbRatio: 1 }] },
      emboss: {
        key: 'emboss',
        label: '压花',
        thumbRatio: 1,
        items: [
          { name: '几何凹槽', thumb: 't', prev: 'p', w: 1, h: 1, ratio: 1, thumbRatio: 1 },
          { name: 'A01', thumb: 't', prev: 'p', w: 1, h: 1, ratio: 1, thumbRatio: 1 },
        ],
      },
    } as never
    const sel: Selection = {
      face: '六扇门',
      head: null,
      pillarL: null,
      pillarR: null,
      lock: null,
      color: null,
      emboss: { '2:top': '几何凹槽', '5:top': 'A01' },
    }
    const entries = buildConfigEntries(sel, catalog, f)
    const emb = entries.filter((e) => e.group === 'emboss')
    expect(emb).toHaveLength(1)
    expect(emb[0].detail).toBe('第 2 扇 · 上')
  })
})
