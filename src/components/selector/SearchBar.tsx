interface Props {
  value: string
  onChange: (q: string) => void
  /** 展开时自动聚焦（手机上点开就能直接打字） */
  autoFocus?: boolean
}

/** 搜索框（支持模糊匹配，具体匹配逻辑在 lib/selection） */
export default function SearchBar({ value, onChange, autoFocus }: Props) {
  return (
    <div className="search-row">
      <input
        className="search"
        placeholder="搜索…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      {value && (
        <button className="clear" onClick={() => onChange('')} aria-label="清除搜索">
          ×
        </button>
      )}
    </div>
  )
}
