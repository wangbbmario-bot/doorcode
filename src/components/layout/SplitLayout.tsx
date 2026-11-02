import type { ReactNode } from 'react'

interface Props {
  /** 左栏占比 % */
  split: number
  onDragStart: () => void
  left: ReactNode
  right: ReactNode
}

/**
 * 左右两栏 + 可拖动分界线（移动端横屏主布局）
 */
export default function SplitLayout({ split, onDragStart, left, right }: Props) {
  return (
    <div className="app">
      <div className="pane-left" style={{ width: `${split}%` }}>
        {left}
      </div>

      <div
        className="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整区域宽度"
        tabIndex={0}
        onPointerDown={onDragStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') e.preventDefault()
        }}
      >
        <span className="grip" />
      </div>

      <div className="pane-right" style={{ width: `${100 - split}%` }}>
        {right}
      </div>
    </div>
  )
}
