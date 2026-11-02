import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 可拖动的左右分栏
 *
 * 返回 split（左栏百分比 20-80）与 startDrag（绑定到分界线）。
 */
export function useSplitDrag() {
  const [split, setSplit] = useState(50)
  const dragging = useRef(false)

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return
    const pct = (e.clientX / window.innerWidth) * 100
    setSplit(Math.min(80, Math.max(20, pct)))
  }, [])

  useEffect(() => {
    const up = () => {
      dragging.current = false
      document.body.classList.remove('dragging')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
    }
  }, [onMove])

  const startDrag = useCallback(() => {
    dragging.current = true
    document.body.classList.add('dragging')
  }, [])

  return { split, startDrag }
}
