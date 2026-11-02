import { useEffect, useRef, useState } from 'react'

export interface Size {
  w: number
  h: number
}

/**
 * 按容器可用空间算出一个保持指定宽高比的盒子尺寸。
 *
 * 用 ResizeObserver 而不是 CSS aspect-ratio：
 * - aspect-ratio + max-width/max-height 混用时比例会失真（min-width:auto 撑破）
 * - JS 算出来的像素尺寸绝对可靠
 */
export function useStageSize(aspectRatio: number, padding = 28) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Size>({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => {
      const r = el.getBoundingClientRect()
      const availW = Math.max(80, r.width - padding)
      const availH = Math.max(80, r.height - padding)
      let w = availW
      let h = w / aspectRatio
      if (h > availH) {
        h = availH
        w = h * aspectRatio
      }
      setBox({ w: Math.round(w), h: Math.round(h) })
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspectRatio, padding])

  return { ref, box }
}
