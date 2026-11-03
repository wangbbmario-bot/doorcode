import { useMemo, useState } from 'react'
import type { Catalog, CatalogItem } from '../../types'
import { assetUrl } from '../../lib/data'
import SearchBar from './SearchBar'
import CategoryTabs from './CategoryTabs'
import AssetGrid from './AssetGrid'
import ImageViewer from '../common/ImageViewer'

interface Props {
  catalog: Catalog
  activeCat: string
  onCat: (cat: string) => void
  query: string
  onQuery: (q: string) => void
  /** 当前分类下已选中的素材名 */
  selectedName: string | null
  /** 当前分类下的收藏名集合 */
  favNames: Set<string>
  slotCount: number
  onPick: (item: CatalogItem) => void
  onToggleFav: (item: CatalogItem) => void
}

/** 模糊匹配（逐字符） */
function fuzzy(hay: string, needle: string): boolean {
  if (!needle) return true
  const h = hay.toLowerCase()
  const n = needle.toLowerCase().trim()
  if (!n) return true
  if (h.includes(n)) return true
  let i = 0
  for (const ch of n) {
    i = h.indexOf(ch, i)
    if (i === -1) return false
    i++
  }
  return true
}

/**
 * 元素选择区（右栏）
 *
 * 结构：搜索框 + 分类 tabs + 素材网格（虚拟滚动）
 * 素材过滤规则（收藏优先 + 模糊搜索）在这里，网格只管渲染。
 */
export default function SelectorPane({
  catalog,
  activeCat,
  onCat,
  query,
  onQuery,
  selectedName,
  favNames,
  slotCount,
  onPick,
  onToggleFav,
}: Props) {
  const group = catalog[activeCat]
  // 大图预览是本组件的局部 UI 状态，组件自治，不上抛
  const [zoomItem, setZoomItem] = useState<CatalogItem | null>(null)

  const items = useMemo(() => {
    if (!group) return []
    const q = query.trim()
    const matched = q ? group.items.filter((i) => fuzzy(i.name, q)) : group.items
    if (!favNames.size) return matched

    // 收藏项不能直接抽到列表最前 —— 那样会让「收藏的小方块」和「长条」挤在同一行，
    // 行内就不是同一种类型了，看着很乱。
    // 改成：**含收藏的整个尺寸档整体提前**，收藏项在本档内排最前。
    // 效果：收藏的小方块 -> 前面几行全是小方块；收藏的长条 -> 长条那一档也整体提前。
    const segs: { b?: number; fav: CatalogItem[]; rest: CatalogItem[] }[] = []
    for (const it of matched) {
      const last = segs[segs.length - 1]
      if (!last || last.b !== it.sizeBucket) {
        segs.push({ b: it.sizeBucket, fav: [], rest: [] })
      }
      const seg = segs[segs.length - 1]
      if (favNames.has(it.name)) seg.fav.push(it)
      else seg.rest.push(it)
    }
    // Set 的迭代顺序 = 收藏时间顺序；多个含收藏的档里，**最近收藏的排最前**，
    // 这样刚收藏的那一档立刻能看见。
    const favTime = new Map<string, number>()
    let t = 0
    for (const n of favNames) favTime.set(n, t++)
    const firstFavTime = (s: { fav: CatalogItem[] }) =>
      s.fav.reduce((max, it) => Math.max(max, favTime.get(it.name) ?? -1), -1)

    const withFav = segs.filter((s) => s.fav.length).sort((a, b) => firstFavTime(b) - firstFavTime(a))
    const without = segs.filter((s) => !s.fav.length)
    const out: CatalogItem[] = []
    for (const s of withFav) out.push(...s.fav, ...s.rest)
    for (const s of without) out.push(...s.rest)
    return out
  }, [group, query, favNames])

  return (
    <div className="selector-pane">
      <SearchBar value={query} onChange={onQuery} />
      <CategoryTabs catalog={catalog} active={activeCat} onChange={onCat} />

      {activeCat === 'emboss' && (
        <div className="tip">
          {slotCount > 0
            ? `点击缩略图，将压花应用到已选的 ${slotCount} 个位置；点右上角放大镜看大图`
            : '先在左侧点击门上的上/中/下位置，再选择压花'}
        </div>
      )}

      <AssetGrid
        items={items}
        selectedName={selectedName}
        favSet={favNames}
        maxH={group?.maxH ?? 1}
        onPick={onPick}
        onToggleFav={onToggleFav}
        onZoom={setZoomItem}
      />

      <ImageViewer
        item={zoomItem}
        onClose={() => setZoomItem(null)}
        footer={
          <>
            <button
              className="btn primary"
              onClick={() => {
                if (zoomItem) onPick(zoomItem)
                setZoomItem(null)
              }}
            >
              选用这个
            </button>
            <a className="btn" href={zoomItem ? assetUrl(zoomItem.prev) : '#'} download>
              下载原图
            </a>
            <button className="btn" onClick={() => setZoomItem(null)}>
              关闭
            </button>
          </>
        }
      />
    </div>
  )
}
