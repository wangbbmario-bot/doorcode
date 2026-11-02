import type { CatalogItem } from '../../types'
import { assetUrl } from '../../lib/data'

interface Props {
  item: CatalogItem | null
  onClose: () => void
  /** 底部额外操作区（如「选用这个」） */
  footer?: React.ReactNode
}

/** 通用大图查看弹层 */
export default function ImageViewer({ item, onClose, footer }: Props) {
  if (!item) return null
  return (
    <div className="zoom-modal" onClick={onClose}>
      <div className="zoom-box" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-head">
          <span className="zoom-title">{item.name}</span>
          <span className="zoom-meta">
            原始 {item.w}×{item.h}
          </span>
          <button className="zoom-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="zoom-img">
          <img src={assetUrl(item.prev)} alt={item.name} />
        </div>
        {footer && <div className="zoom-foot">{footer}</div>}
      </div>
    </div>
  )
}
