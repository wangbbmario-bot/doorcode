import type { Catalog } from '../../types'

export const CATEGORY_ORDER = ['face', 'emboss', 'color', 'head', 'pillar', 'lock'] as const

interface Props {
  catalog: Catalog
  active: string
  onChange: (cat: string) => void
}

/** 一级元素分类（固定顺序） */
export default function CategoryTabs({ catalog, active, onChange }: Props) {
  return (
    <div className="cat-row">
      {CATEGORY_ORDER.map((k) => (
        <button
          key={k}
          className={`cat ${active === k ? 'on' : ''}`}
          onClick={() => onChange(k)}
        >
          {catalog[k]?.label ?? k}
        </button>
      ))}
    </div>
  )
}
