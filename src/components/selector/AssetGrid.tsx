import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem } from '../../types'
import { computeGrid, computeWindow, thumbHeight } from '../../lib/selection'
import AssetCell from './AssetCell'

const MIN_CELL = 116
const GAP = 8
const PAD = 12
const NAME_H = 26
const BORDER = 1

interface Props {
  items: CatalogItem[]
  /** 同一分类下已选中的素材名 */
  selectedName: string | null
  favSet: Set<string>
  /** 格子高度上限（相对格宽的倍数） */
  maxH: number
  onPick: (item: CatalogItem) => void
  onToggleFav: (item: CatalogItem) => void
  onZoom: (item: CatalogItem) => void
}

/**
 * 素材网格（虚拟滚动）
 *
 * 上千张缩略图一次性挂载会把请求全排队、整屏变成骨架，
 * 所以只渲染视口附近的行（+3 行 overscan），DOM 节点始终 < 50。
 */
export default function AssetGrid({
  items,
  selectedName,
  favSet,
  maxH,
  onPick,
  onToggleFav,
  onZoom,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [cols, setCols] = useState(4)
  const [cellW, setCellW] = useState(MIN_CELL)
  const [paneW, setPaneW] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      // 以「元素选择区」所在的右栏为基准测量：
      // 滚动容器自身有 overflow，宽度会被内容带跑，不能拿它当基准
      const pane = el.closest('.pane-right') as HTMLElement | null
      if (!pane) return
      const pw = Math.round(pane.getBoundingClientRect().width) - BORDER
      setPaneW((p) => (p === pw ? p : pw))
      const { cols: c, cellW: cw } = computeGrid(pw, MIN_CELL, GAP, PAD)
      setCols((p) => (p === c ? p : c))
      setCellW((p) => (p === cw ? p : cw))
      setViewportH((p) => (p === el.clientHeight ? p : el.clientHeight))
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const pane = el.closest('.pane-right')
    const ro = new ResizeObserver(schedule)
    if (pane) ro.observe(pane)
    ro.observe(el)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  // 切换分类 / 搜索时回到顶部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [items])

  // 行高：按**每行实际的最高格子**算。
  // 压花素材比例从 0.1 到 3.6 都有，若行高统一按最扁的算，
  // 矮素材那一行下方会整块留白（用户看到的「空了一行」）。
  const rowHeights = useMemo(() => {
    const rows = Math.ceil(items.length / cols)
    const hs: number[] = []
    for (let r = 0; r < rows; r++) {
      let mx = 0
      for (let c = 0; c < cols; c++) {
        const it = items[r * cols + c]
        if (!it) break
        mx = Math.max(mx, thumbHeight(cellW, it.thumbRatio, maxH))
      }
      hs.push(mx + NAME_H + GAP)
    }
    return hs
  }, [items, cols, cellW, maxH])

  // 每行 top 的前缀和（末位 = 总高度）
  const rowTops = useMemo(() => {
    const tops = [0]
    for (const h of rowHeights) tops.push(tops[tops.length - 1] + h)
    return tops
  }, [rowHeights])

  const totalRows = rowHeights.length
  const { start, end } = computeWindow(scrollTop, viewportH, rowTops, cols, items.length)
  const visible = items.slice(start, end)

  return (
    <>
      <div
        className="grid-scroll"
        ref={scrollRef}
        style={paneW ? { width: paneW } : undefined}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div
          className="grid"
          style={{ height: rowTops[totalRows] ?? 0, gridTemplateColumns: `repeat(${cols}, ${cellW}px)` }}
        >
          {visible.map((it, i) => {
            const idx = start + i
            const row = Math.floor(idx / cols)
            const col = idx % cols
            return (
              <div
                key={it.name}
                className={`cell cell-pos ${selectedName === it.name ? 'sel' : ''}`}
                style={{
                  position: 'absolute',
                  width: cellW,
                  height: thumbHeight(cellW, it.thumbRatio, maxH) + NAME_H,
                  transform: `translate(${col * (cellW + GAP)}px, ${rowTops[row] ?? 0}px)`,
                }}
              >
                <AssetCell
                  item={it}
                  imgH={thumbHeight(cellW, it.thumbRatio, maxH)}
                  selected={selectedName === it.name}
                  fav={favSet.has(it.name)}
                  onPick={() => onPick(it)}
                  onToggleFav={() => onToggleFav(it)}
                  onZoom={() => onZoom(it)}
                />
              </div>
            )
          })}
          {items.length === 0 && <div className="empty">没有匹配的素材</div>}
        </div>
      </div>

      <div className="grid-foot">
        共 {items.length} 项 · {cols} 列 · 已渲染 {visible.length} 个节点
      </div>
    </>
  )
}
