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
    // 收藏的排前面
    const fav = matched.filter((i) => favNames.has(i.name))
    const rest = matched.filter((i) => !favNames.has(i.name))
    return [...fav, ...rest]
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
