import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Faces, Catalog } from '../src/types'

const ROOT = path.resolve(__dirname, '..')
const faces: Faces = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/faces.json'), 'utf8'))
const catalog: Catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/catalog.json'), 'utf8'))
const leafLines = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/data/leaf_lines.json'), 'utf8'),
)

const LEAF_COUNT: Record<string, number> = { 两扇门: 2, 四扇门: 4, 六扇门: 6, 八扇门: 8 }

describe('门面槽位几何（BUG7: 八扇门门框与底图未对齐）', () => {
  const keys = Object.keys(faces)
  it('4 种门面都在', () => {
    expect(new Set(keys)).toEqual(new Set(['两扇门', '四扇门', '六扇门', '八扇门']))
    expect(keys).toHaveLength(4)
  })

  it.each(keys)('%s 的门扇数正确', (k) => {
    expect(faces[k].leaves).toHaveLength(LEAF_COUNT[k])
  })

  it.each(keys)('%s 门扇横向边界严格递增且落在画布内', (k) => {
    const xs = faces[k].leaves.flatMap((l) => [l.x0, l.x1])
    expect(xs.every((x) => x > 0 && x < 1)).toBe(true)
    for (let i = 0; i < faces[k].leaves.length; i++) {
      const l = faces[k].leaves[i]
      expect(l.x1).toBeGreaterThan(l.x0)
      if (i > 0) expect(l.x0).toBeCloseTo(faces[k].leaves[i - 1].x1, 6)
    }
  })

  it.each(keys)('%s 上/中/下三段在门洞范围内且首尾相接', (k) => {
    const f = faces[k]
    for (const leaf of f.leaves) {
      const z = leaf.zones
      expect(z.top.y0).toBeCloseTo(f.doorTop, 4)
      expect(z.top.y1).toBeCloseTo(z.mid.y0, 4)
      expect(z.mid.y1).toBeCloseTo(z.bottom.y0, 4)
      expect(z.bottom.y1).toBeCloseTo(f.doorBottom, 4)
      expect(z.top.y0).toBeLessThan(z.bottom.y1)
      expect(z.mid.y0).toBeGreaterThan(z.top.y0)
      expect(z.bottom.y0).toBeGreaterThan(z.mid.y0)
    }
  })

  it.each(keys)('%s 左右门扇边界对称（透视误差 < 1.5%）', (k) => {
    const f = faces[k]
    const W = f.w
    let maxDev = 0
    for (let i = 0; i < f.leaves.length; i++) {
      const l = f.leaves[i]
      const r = f.leaves[f.leaves.length - 1 - i]
      maxDev = Math.max(maxDev, Math.abs(l.x0 + r.x1 - 1))
    }
    expect(maxDev).toBeLessThan(0.015)
    expect(W).toBeGreaterThan(0)
  })

  it.each(keys)('%s 与标定文件 leaf_lines.json 一致', (k) => {
    const cfg = leafLines[k]
    const lines: number[] = cfg.lines
    const leaves = faces[k].leaves
    // 标定线数 = 门扇数 + 1
    expect(lines).toHaveLength(leaves.length + 1)
    for (let i = 0; i < leaves.length; i++) {
      expect(leaves[i].x0).toBeCloseTo(lines[i] / cfg.w, 4)
      expect(leaves[i].x1).toBeCloseTo(lines[i + 1] / cfg.w, 4)
    }
  })

  it.each(keys)('%s 门头/门柱框落在门框内', (k) => {
    const f = faces[k]
    const inside = (b: { x0: number; x1: number }) => {
      expect(b.x0).toBeGreaterThanOrEqual(-0.001)
      expect(b.x1).toBeLessThanOrEqual(1.001)
    }
    inside(f.headBox)
    inside(f.pillarL)
    inside(f.pillarR)
    // 门柱左右对称
    expect(f.pillarL.x0).toBeCloseTo(1 - f.pillarR.x1, 4)
    expect(f.pillarL.x1).toBeCloseTo(1 - f.pillarR.x0, 4)
  })

  it.each(keys)('%s 门锁框成对出现在中轴两侧', (k) => {
    const f = faces[k]
    expect(f.lockL.x1).toBeLessThan(0.5)
    expect(f.lockR.x0).toBeGreaterThan(0.5)
    expect(f.lockL.x0).toBeCloseTo(1 - f.lockR.x1, 4)
  })
})

describe('素材索引', () => {
  const cats = ['face', 'emboss', 'color', 'head', 'pillar', 'lock']
  it.each(cats)('%s 分类有素材', (c) => {
    expect(catalog[c]).toBeTruthy()
    expect(catalog[c].items.length).toBeGreaterThan(0)
  })

  it.each(cats)('%s 的每个缩略图与预览图文件都存在', (c) => {
    for (const it of catalog[c].items) {
      expect(fs.existsSync(path.join(ROOT, 'public', it.thumb)), `缺少 ${it.thumb}`).toBe(true)
      expect(fs.existsSync(path.join(ROOT, 'public', it.prev)), `缺少 ${it.prev}`).toBe(true)
    }
  })

  it.each(cats)('%s 每项都有合法的 thumbRatio', (c) => {
    for (const it of catalog[c].items) {
      expect(it.thumbRatio).toBeGreaterThan(0)
      expect(it.thumbRatio).toBeLessThanOrEqual(10)
    }
  })

  it('压花分类有 1000+ 项', () => {
    expect(catalog.emboss.items.length).toBeGreaterThan(1000)
  })

  it('门面分类不含"副本"重复项', () => {
    expect(catalog.face.items.some((i) => i.name.includes('副本'))).toBe(false)
  })

  it('门面项与 faces.json 的 key 对应', () => {
    const names = catalog.face.items.map((i) => i.name)
    for (const k of Object.keys(faces)) expect(names).toContain(k)
  })
})
