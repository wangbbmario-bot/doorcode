export interface CatalogItem {
  name: string
  thumb: string
  prev: string
  w: number
  h: number
  /** 原始宽高比 */
  ratio: number
  /** 缩略图本身的宽高比（构建时按分类策略裁切） */
  thumbRatio: number
  /** 尺寸档号：压花按显示尺寸分档，同档的项大小相近（构建时排序） */
  sizeBucket?: number
}

export interface CatalogBucket {
  id: number
  /** 尺寸档名称（大竖板 / 窄条 …） */
  name: string
  count: number
}

export interface CatalogGroup {
  key: string
  label: string
  items: CatalogItem[]
  /** 该分类缩略图的默认宽高比 */
  thumbRatio: number
  /** 格子高度上限（相对格宽的倍数），防止极端比例撑爆一屏 */
  maxH?: number
  /** 二级分类（目前只有压花有，按尺寸档） */
  buckets?: CatalogBucket[]
}

export type Catalog = Record<string, CatalogGroup>

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ZoneRect {
  y0: number
  y1: number
}

export interface Leaf {
  i: number
  x0: number
  x1: number
  zones: { top: ZoneRect; mid: ZoneRect; bottom: ZoneRect }
}

export interface FaceSpec {
  key: string
  w: number
  h: number
  /** 门框外框（画布比例 0-1） */
  frame: Box
  doorTop: number
  doorBottom: number
  leaves: Leaf[]
  /** 以下均为「相对门框」比例，运行时换算成画布比例 */
  headBox: Box
  pillarL: Box
  pillarR: Box
  lockL: Box
  lockR: Box
  thumb: string
  prev: string
}

export type Faces = Record<string, FaceSpec>

export type ZoneKey = 'top' | 'mid' | 'bottom'

export const ZONE_LABEL: Record<ZoneKey, string> = { top: '上', mid: '中', bottom: '下' }

export interface Slot {
  leaf: number
  zone: ZoneKey
}

export const slotId = (s: Slot) => `${s.leaf}:${s.zone}`

export interface Selection {
  face: string
  head: string | null
  pillarL: string | null
  pillarR: string | null
  lock: string | null
  color: string | null
  /** slotId -> 压花名称 */
  emboss: Record<string, string>
}

export const emptySelection = (face: string): Selection => ({
  face,
  head: null,
  pillarL: null,
  pillarR: null,
  lock: null,
  color: null,
  emboss: {},
})

/** 门框相对坐标 -> 画布绝对坐标 */
export function resolveBox(frame: Box, b: Box): Box {
  const fw = frame.x1 - frame.x0
  const fh = frame.y1 - frame.y0
  return {
    x0: frame.x0 + b.x0 * fw,
    y0: frame.y0 + b.y0 * fh,
    x1: frame.x0 + b.x1 * fw,
    y1: frame.y0 + b.y1 * fh,
  }
}
