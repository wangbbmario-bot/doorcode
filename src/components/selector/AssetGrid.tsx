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

  // 行高：按当前分类里最"扁"的素材比例算
  const rowH = useMemo(() => {
    let minRatio = Infinity
    for (const it of items) minRatio = Math.min(minRatio, it.thumbRatio || 1)
    const maxImg = Number.isFinite(minRatio) ? thumbHeight(cellW, minRatio) : cellW
    return maxImg + NAME_H + GAP
  }, [items, cellW])

  const totalRows = Math.ceil(items.length / cols)
  const { start, end } = computeWindow(
    scrollTop,
    viewportH,
    rowH,
    totalRows,
    cols,
    items.length,
  )
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
          style={{ height: totalRows * rowH, gridTemplateColumns: `repeat(${cols}, ${cellW}px)` }}
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
                  height: thumbHeight(cellW, it.thumbRatio) + NAME_H,
                  transform: `translate(${col * (cellW + GAP)}px, ${row * rowH}px)`,
                }}
              >
                <AssetCell
                  item={it}
                  imgH={thumbHeight(cellW, it.thumbRatio)}
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
