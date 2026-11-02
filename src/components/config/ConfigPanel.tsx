import { useState } from 'react'
import type { ConfigEntry } from '../../lib/selection'

interface Props {
  entries: ConfigEntry[]
  pendingSlots: number
  onClear: (entry: ConfigEntry) => void
  onClearAll: () => void
}

const GROUP_ICON: Record<string, string> = {
  face: '▤',
  head: '⌸',
  pillar: '▯',
  lock: '⚿',
  color: '◐',
  emboss: '❖',
}

/**
 * 「已配置项」浮动清单
 * 放在效果展示区左上角，半透明背景 + 毛玻璃，不遮挡门面
 */
export default function ConfigPanel({ entries, pendingSlots, onClear, onClearAll }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className={`config-float ${open ? 'open' : 'closed'}`}>
      <button className="config-float-head" onClick={() => setOpen((v) => !v)}>
        <span className="cf-title">已配置项</span>
        <b className={entries.length ? 'on' : ''}>{entries.length}</b>
        {pendingSlots > 0 && <span className="cf-pending">待选 {pendingSlots}</span>}
        {entries.length > 0 && (
          <span
            className="cf-clear"
            role="button"
            title="清空所有已配置项"
            onClick={(e) => {
              e.stopPropagation()
              onClearAll()
            }}
          >
            清空
          </span>
        )}
        <span className={`caret ${open ? 'up' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="config-float-body">
          {entries.length === 0 ? (
            <div className="config-empty">
              还没有配置。先在门面上选位置，再选压花类型；门头/门柱/门锁/颜色直接点右侧缩略图。
            </div>
          ) : (
            <ul className="config-list">
              {entries.map((e) => (
                <li key={e.key} className={`config-item g-${e.group}`}>
                  <span className="ci-icon">{GROUP_ICON[e.group] ?? '•'}</span>
                  <span className="ci-label">{e.label}</span>
                  {e.detail && <span className="ci-detail">{e.detail}</span>}
                  <span className="ci-value" title={e.value}>
                    {e.value}
                  </span>
                  <button
                    className="ci-x"
                    onClick={() => onClear(e)}
                    aria-label={`取消${e.label}`}
                    title={`取消${e.label}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
