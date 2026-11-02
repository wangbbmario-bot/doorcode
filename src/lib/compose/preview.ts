/**
 * 实时合成预览（Canvas）
 *
 * 把门面底图 + 门头 + 门柱 + 门锁 + 压花 + 颜色 叠成一张图。
 * 这张图既是左侧预览，也是喂给 Seedream 的「合成底图」。
 *
 * 业务规则（左右对称、槽位划分）来自 ../selection 的纯函数，这里只做绘制。
 */
import type { Catalog, FaceSpec, Selection } from '../../types'
import { resolveBox } from '../../types'
import { effectiveEmboss } from '../selection'
import { assetUrl } from '../data'
import { colorTintOf, drawContained, drawCover, findItem, loadImage } from './draw'

export interface ComposeOptions {
  width?: number
  /** true = 喂给 AI 的底图（压花不透明度更高） */
  forAI?: boolean
}

export async function composePreview(
  face: FaceSpec,
  sel: Selection,
  catalog: Catalog,
  opts: ComposeOptions = {},
): Promise<string> {
  const W = opts.width ?? 1400
  const H = Math.round((W * face.h) / face.w)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!

  const base = await loadImage(assetUrl(face.prev))
  ctx.drawImage(base, 0, 0, W, H)

  const frame = face.frame
  const abs = (b: { x0: number; y0: number; x1: number; y1: number }) => ({
    x: b.x0 * W,
    y: b.y0 * H,
    w: (b.x1 - b.x0) * W,
    h: (b.y1 - b.y0) * H,
  })

  // 门头
  const head = findItem(catalog, 'head', sel.head)
  if (head) {
    const img = await loadImage(assetUrl(head.prev))
    drawContained(ctx, img, abs(resolveBox(frame, face.headBox)), 1)
  }

  // 门柱（左 / 右）
  for (const [name, box] of [
    [sel.pillarL, face.pillarL],
    [sel.pillarR, face.pillarR],
  ] as const) {
    const item = findItem(catalog, 'pillar', name)
    if (!item) continue
    const img = await loadImage(assetUrl(item.prev))
    drawContained(ctx, img, abs(resolveBox(frame, box)), 1)
  }

  // 门锁（成对显示）
  const lock = findItem(catalog, 'lock', sel.lock)
  if (lock) {
    const img = await loadImage(assetUrl(lock.prev))
    for (const box of [face.lockL, face.lockR]) {
      const b = abs({
        x0: box.x0,
        y0: frame.y0 + box.y0 * (frame.y1 - frame.y0),
        x1: box.x1,
        y1: frame.y0 + box.y1 * (frame.y1 - frame.y0),
      })
      drawContained(ctx, img, b, 1)
    }
  }

  // 压花：门左右轴对称，sel.emboss 只存左半，右半按镜像取同一个压花
  for (const leaf of face.leaves) {
    for (const zk of ['top', 'mid', 'bottom'] as const) {
      const name = effectiveEmboss(sel.emboss, face, { leaf: leaf.i, zone: zk })
      const item = findItem(catalog, 'emboss', name ?? null)
      if (!item) continue
      const img = await loadImage(assetUrl(item.prev))
      const z = leaf.zones[zk]
      drawCover(
        ctx,
        img,
        {
          x: leaf.x0 * W,
          y: z.y0 * H,
          w: (leaf.x1 - leaf.x0) * W,
          h: (z.y1 - z.y0) * H,
        },
        opts.forAI ? 0.95 : 0.72,
      )
    }
  }

  // 颜色（color 混合模式重着色）
  const color = findItem(catalog, 'color', sel.color)
  if (color) {
    const tint = await colorTintOf(color)
    if (tint) {
      const [r, g, b] = tint
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const sat = mx === 0 ? 0 : (mx - mn) / mx
      if (sat > 0.08) {
        ctx.save()
        ctx.globalCompositeOperation = 'color'
        ctx.globalAlpha = 0.55
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }
    }
  }

  return cv.toDataURL('image/jpeg', 0.9)
}
