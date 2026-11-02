/**
 * Canvas 绘制原语
 *
 * 只负责"把一张图画到画布上"，不含任何业务语义（门/压花/对称等）。
 * 业务规则请放在 preview.ts / prompt.ts / refs.ts。
 */
import type { Catalog, CatalogItem } from '../../types'
import { assetUrl } from '../data'

const cache = new Map<string, HTMLImageElement>()

/** 加载图片（带缓存）。同源图片可安全用于 canvas.toDataURL */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src)
  if (hit?.complete) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      cache.set(src, img)
      resolve(img)
    }
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`))
    img.src = src
  })
}

/** 按分类 + 名称找素材 */
export function findItem(
  catalog: Catalog,
  group: string,
  name: string | null,
): CatalogItem | null {
  if (!name) return null
  const g = catalog[group]
  if (!g) return null
  return g.items.find((i) => i.name === name) ?? null
}

export interface DrawBox {
  x: number
  y: number
  w: number
  h: number
}

/** 绘制一个素材到目标框（保持比例，contain 居中） */
export function drawContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: DrawBox,
  alpha = 1,
) {
  const ir = img.width / img.height
  const br = box.w / box.h
  let dw = box.w
  let dh = box.h
  if (ir > br) dh = box.w / ir
  else dw = box.h * ir
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh)
  ctx.restore()
}

/** 素材填充目标框（cover 裁切） */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: DrawBox,
  alpha = 1,
) {
  const ir = img.width / img.height
  const br = box.w / box.h
  let sw = img.width
  let sh = img.height
  let sx = 0
  let sy = 0
  if (ir > br) {
    sw = img.height * br
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / br
    sy = (img.height - sh) / 2
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.w, box.h)
  ctx.restore()
}

/** 从颜色素材取主色（中心 60% 区域均值，忽略近白背景） */
export async function colorTintOf(
  item: CatalogItem,
): Promise<[number, number, number] | null> {
  const img = await loadImage(assetUrl(item.prev))
  const c = document.createElement('canvas')
  const S = 48
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')!
  ctx.drawImage(
    img,
    img.width * 0.2,
    img.height * 0.2,
    img.width * 0.6,
    img.height * 0.6,
    0,
    0,
    S,
    S,
  )
  const d = ctx.getImageData(0, 0, S, S).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    const rr = d[i]
    const gg = d[i + 1]
    const bb = d[i + 2]
    const mx = Math.max(rr, gg, bb)
    const mn = Math.min(rr, gg, bb)
    if (mx > 245 && mx - mn < 12) continue // 近白背景，跳过
    r += rr
    g += gg
    b += bb
    n++
  }
  if (n === 0) return null
  return [r / n, g / n, b / n]
}
