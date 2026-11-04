import { useEffect, useMemo, useState } from 'react'
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

/** 放大镜图标（用 SVG 不用 emoji：emoji 各平台渲染风格不统一） */
function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.2" y1="16.2" x2="21" y2="21" />
    </svg>
  )
}

/**
 * 元素选择区（右栏）
 *
 * 结构：导航行（一级分类 + 搜索）+ 提示 + 二级分类 + 素材网格（虚拟滚动）
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
  // 二级分类（压花的尺寸档）：null = 全部，-1 = 收藏
  const [bucket, setBucket] = useState<number | null>(null)
  /**
   * 搜索默认收成图标按钮，点开才占满整行。
   *
   * 为什么不让搜索框常驻：手机横屏下 6 个一级分类必须**一屏全露**
   * （否则切个分类要先横滑一段），搜索是低频操作 —— 让位给分类。
   * 展开时搜索框**替换**分类行（不是叠在上面），高度不变、不跳版。
   */
  const [searchOpen, setSearchOpen] = useState(false)

  // 切换主分类时回到「全部」
  useEffect(() => {
    setBucket(null)
  }, [activeCat])

  const buckets = group?.buckets
  const favCount = useMemo(() => {
    if (!group) return 0
    let n = 0
    for (const it of group.items) if (favNames.has(it.name)) n++
    return n
  }, [group, favNames])

  const items = useMemo(() => {
    if (!group) return []
    const q = query.trim()
    let matched = q ? group.items.filter((i) => fuzzy(i.name, q)) : group.items

    // 二级分类过滤
    if (bucket === -1) {
      matched = matched.filter((i) => favNames.has(i.name))
    } else if (bucket !== null) {
      matched = matched.filter((i) => i.sizeBucket === bucket)
    }

    if (!favNames.size) return matched

    // 收藏项排**它自己那一档的最前**（不是整个列表最前）：
    // 抽到列表最前会让「收藏的小方块」和「长条」挤在同一行，行内就不是同一种类型了。
    // 有了二级分类后，用户可以直接切到对应尺寸档去找，收藏项在档内排最前就够用了。
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
    const out: CatalogItem[] = []
    for (const s of segs) out.push(...s.fav, ...s.rest)
    return out
  }, [group, query, favNames, bucket])

  return (
    <div className="selector-pane">
      {/* 导航行：常态是「一级分类 + 搜索图标」；点开搜索后换成「搜索框 + 取消」 */}
      <div className="nav-row">
        {searchOpen ? (
          <>
            <SearchBar value={query} onChange={onQuery} autoFocus />
            <button
              className="search-close"
              onClick={() => {
                setSearchOpen(false)
                onQuery('')
              }}
            >
              取消
            </button>
          </>
        ) : (
          <>
            <CategoryTabs catalog={catalog} active={activeCat} onChange={onCat} />
            <button
              className="search-toggle"
              onClick={() => setSearchOpen(true)}
              aria-label="搜索素材"
              title="搜索素材"
            >
              <SearchIcon />
            </button>
          </>
        )}
      </div>

      {activeCat === 'emboss' && (
        <div className="tip">
          {slotCount > 0
            ? `应用到已选的 ${slotCount} 个位置 · 点右上角 ⤢ 看大图`
            : '先在左侧点门上的上/中/下位置，再选压花'}
        </div>
      )}

      {buckets && buckets.length > 0 && (
        <div className="sub-tabs">
          <button
            className={`sub-tab ${bucket === null ? 'on' : ''}`}
            onClick={() => setBucket(null)}
          >
            全部 <b>{group?.items.length ?? 0}</b>
          </button>
          <button
            className={`sub-tab ${bucket === -1 ? 'on' : ''}`}
            onClick={() => setBucket(-1)}
            disabled={favCount === 0}
          >
            收藏 <b>{favCount}</b>
          </button>
          {buckets.map((b) => (
            <button
              key={b.id}
              className={`sub-tab ${bucket === b.id ? 'on' : ''}`}
              onClick={() => setBucket(b.id)}
            >
              {b.name} <b>{b.count}</b>
            </button>
          ))}
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
