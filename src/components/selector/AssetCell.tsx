import type { CatalogItem } from '../../types'
import { assetUrl } from '../../lib/data'

interface Props {
  item: CatalogItem
  /** 图片区高度（按素材比例算） */
  imgH: number
  selected: boolean
  fav: boolean
  onPick: () => void
  onToggleFav: () => void
  onZoom: () => void
}

/** 网格里的单个素材单元 */
export default function AssetCell({
  item,
  imgH,
  selected,
  fav,
  onPick,
  onToggleFav,
  onZoom,
}: Props) {
  return (
    <>
      <button className="cell-img" style={{ height: imgH }} onClick={onPick} title={item.name}>
        <img src={assetUrl(item.thumb)} alt={item.name} loading="lazy" decoding="async" />
      </button>
      <span className="cell-name">{item.name}</span>
      <button
        className="zoom"
        onClick={(e) => {
          e.stopPropagation()
          onZoom()
        }}
        aria-label="查看大图"
        title="查看大图"
      >
        ⤢
      </button>
      <button
        className={`fav ${fav ? 'on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFav()
        }}
        aria-label="收藏"
        title="收藏"
      >
        ★
      </button>
    </>
  )
}
