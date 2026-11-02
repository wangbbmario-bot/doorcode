import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readHistory,
  readTrash,
  writeHistory,
  pushHistory,
  softDeleteHistory,
  restoreHistory,
  purgeHistory,
  MAX_HISTORY,
} from '../server/history.mjs'
import { applyHistoryConfig } from '../src/lib/selection'
import type { Selection } from '../src/types'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xdd-hist-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const rec = (id: string, over = {}) => ({
  id,
  file: `/generated/${id}.jpg`,
  createdAt: '2026-11-01T03:00:00.000Z',
  elapsedMs: 12000,
  size: '2496x1664',
  prompt: 'p',
  config: { face: '六扇门' },
  ...over,
})

describe('生成历史索引', () => {
  it('目录不存在时返回空数组', () => {
    expect(readHistory(path.join(dir, 'nope'))).toEqual([])
  })

  it('写入后能读回', () => {
    writeHistory(dir, [rec('a')])
    expect(readHistory(dir)).toHaveLength(1)
    expect(readHistory(dir)[0].id).toBe('a')
  })

  it('索引文件损坏时返回空数组而不是抛错', () => {
    fs.writeFileSync(path.join(dir, 'index.json'), '{ 坏掉的 json')
    expect(readHistory(dir)).toEqual([])
  })

  it('push 把新记录放在最前（倒序）', () => {
    pushHistory(dir, rec('a'))
    pushHistory(dir, rec('b'))
    expect(readHistory(dir).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('最多保留 MAX_HISTORY 条', () => {
    const many = Array.from({ length: MAX_HISTORY + 20 }, (_, i) => rec(`id${i}`))
    writeHistory(dir, many)
    expect(readHistory(dir)).toHaveLength(MAX_HISTORY)
    expect(readHistory(dir)[0].id).toBe('id0')
  })

  it('软删后默认列表不再返回该条，但回收站能看到', () => {
    pushHistory(dir, rec('a'))
    pushHistory(dir, rec('b'))
    const removed = softDeleteHistory(dir, 'a')
    expect(removed?.id).toBe('a')
    expect(removed?.deletedAt).toBeTruthy()
    expect(readHistory(dir).map((x) => x.id)).toEqual(['b'])
    expect(readHistory(dir, true).map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('软删不存在的 id 返回 null', () => {
    pushHistory(dir, rec('a'))
    expect(softDeleteHistory(dir, 'zzz')).toBeNull()
    expect(readHistory(dir)).toHaveLength(1)
  })

  it('重复软删同一条返回 null（不会覆盖首个删除时间）', () => {
    pushHistory(dir, rec('a'))
    softDeleteHistory(dir, 'a')
    const first = readHistory(dir, true)[0].deletedAt
    expect(softDeleteHistory(dir, 'a')).toBeNull()
    expect(readHistory(dir, true)[0].deletedAt).toBe(first)
  })

  it('软删不会动磁盘上的图片文件', () => {
    pushHistory(dir, rec('a'))
    const img = path.join(dir, 'a.jpg')
    fs.writeFileSync(img, 'fake-jpeg')
    softDeleteHistory(dir, 'a')
    expect(fs.existsSync(img)).toBe(true)
  })

  it('恢复后重新回到正常列表', () => {
    pushHistory(dir, rec('a'))
    softDeleteHistory(dir, 'a')
    const back = restoreHistory(dir, 'a')
    expect(back?.id).toBe('a')
    expect(readHistory(dir).map((x) => x.id)).toEqual(['a'])
    expect(readHistory(dir)[0].deletedAt).toBeUndefined()
  })

  it('恢复一条没删过的记录返回 null', () => {
    pushHistory(dir, rec('a'))
    expect(restoreHistory(dir, 'a')).toBeNull()
    expect(readHistory(dir)).toHaveLength(1)
  })

  it('彻底删除会移出索引并删掉图片文件', () => {
    pushHistory(dir, rec('a'))
    const img = path.join(dir, 'a.jpg')
    fs.writeFileSync(img, 'fake-jpeg')
    const gone = purgeHistory(dir, 'a')
    expect(gone?.id).toBe('a')
    expect(readHistory(dir, true)).toHaveLength(0)
    expect(fs.existsSync(img)).toBe(false)
  })

  it('彻底删除时图片文件已不存在也不报错', () => {
    pushHistory(dir, rec('a'))
    expect(() => purgeHistory(dir, 'a')).not.toThrow()
    expect(readHistory(dir, true)).toHaveLength(0)
  })

  it('readTrash 只返回已软删的记录', () => {
    pushHistory(dir, rec('a'))
    pushHistory(dir, rec('b'))
    softDeleteHistory(dir, 'a')
    expect(readTrash(dir).map((x) => x.id)).toEqual(['a'])
    expect(readHistory(dir).map((x) => x.id)).toEqual(['b'])
  })

  it('readTrash 为空时返回空数组', () => {
    pushHistory(dir, rec('a'))
    expect(readTrash(dir)).toEqual([])
  })

  it('未删记录已满上限时，恢复的记录仍要留在列表里', () => {
    const many = Array.from({ length: MAX_HISTORY }, (_, i) => rec(`id${i}`))
    writeHistory(dir, many)
    softDeleteHistory(dir, 'id0')
    expect(readHistory(dir)).toHaveLength(MAX_HISTORY - 1)
    restoreHistory(dir, 'id0')
    expect(readHistory(dir)).toHaveLength(MAX_HISTORY)
    expect(readHistory(dir)[0].id).toBe('id0')
  })

  it('回收站里的记录不占 MAX_HISTORY 额度', () => {
    const many = Array.from({ length: MAX_HISTORY }, (_, i) => rec(`id${i}`))
    writeHistory(dir, many)
    for (const r of many) softDeleteHistory(dir, r.id)
    expect(readHistory(dir)).toHaveLength(0)
    expect(readHistory(dir, true)).toHaveLength(MAX_HISTORY)
    pushHistory(dir, rec('fresh'))
    expect(readHistory(dir).map((x) => x.id)).toEqual(['fresh'])
    expect(readHistory(dir, true)).toHaveLength(MAX_HISTORY + 1)
  })
})

describe('套用历史配置', () => {
  const cur: Selection = {
    face: '六扇门',
    head: '旧门头',
    pillarL: '旧门柱',
    pillarR: '旧门柱',
    lock: '旧门锁',
    color: '旧颜色',
    emboss: { '3:top': '旧压花' },
  }

  it('用历史快照覆盖全部配置', () => {
    const cfg = {
      face: '八扇门',
      head: '新门头',
      pillarL: '新门柱',
      pillarR: '新门柱',
      lock: '新门锁',
      color: '新颜色',
      emboss: { '2:mid': '新压花' },
    }
    const next = applyHistoryConfig(cur, cfg)
    expect(next.face).toBe('八扇门')
    expect(next.head).toBe('新门头')
    expect(next.pillarL).toBe('新门柱')
    expect(next.pillarR).toBe('新门柱')
    expect(next.lock).toBe('新门锁')
    expect(next.color).toBe('新颜色')
    expect(next.emboss).toEqual({ '2:mid': '新压花' })
  })

  it('历史里没配的项会被清空（而不是保留当前值）', () => {
    const next = applyHistoryConfig(cur, { face: '八扇门', emboss: {} })
    expect(next.head).toBeNull()
    expect(next.pillarL).toBeNull()
    expect(next.lock).toBeNull()
    expect(next.color).toBeNull()
  })

  it('快照里没有 face 时保留当前门面', () => {
    const next = applyHistoryConfig(cur, { emboss: {} })
    expect(next.face).toBe('六扇门')
  })

  it('空快照返回原配置（不破坏现状）', () => {
    expect(applyHistoryConfig(cur, null)).toBe(cur)
  })
})
