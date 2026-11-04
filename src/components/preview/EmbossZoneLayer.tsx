import { useMemo } from 'react'
import type { FaceSpec, Selection, Slot, ZoneKey } from '../../types'
import { ZONE_LABEL, slotId } from '../../types'
import { isLeftHalf } from '../../lib/selection'

interface Props {
  face: FaceSpec
  sel: Selection
  slots: Slot[]
  onToggle: (s: Slot) => void
  onClear: (s: Slot) => void
}

/**
 * 压花槽位热区
 *
 * 门左右轴对称：**只有左半可点**，右半由 Canvas 合成时镜像。
 */
export default function EmbossZoneLayer({ face, sel, slots, onToggle, onClear }: Props) {
  const active = useMemo(() => new Set(slots.map(slotId)), [slots])

  return (
    <>
      {face.leaves.map((leaf) =>
        !isLeftHalf(face, leaf.i) ? null : (['top', 'mid', 'bottom'] as ZoneKey[]).map((zk) => {
          const z = leaf.zones[zk]
          const id = slotId({ leaf: leaf.i, zone: zk })
          const isActive = active.has(id)
          const has = Boolean(sel.emboss[id])
          return (
            <button
              key={id}
              className={`zone z-${zk} ${isActive ? 'active' : ''} ${has ? 'filled' : ''}`}
              style={{
                left: `${leaf.x0 * 100}%`,
                width: `${(leaf.x1 - leaf.x0) * 100}%`,
                top: `${z.y0 * 100}%`,
                height: `${(z.y1 - z.y0) * 100}%`,
              }}
              onClick={(e) => {
                e.stopPropagation()
                onToggle({ leaf: leaf.i, zone: zk })
              }}
              title={
                zk === 'mid'
                  ? `第 ${leaf.i} 扇 · ${ZONE_LABEL[zk]}`
                  : `第 ${leaf.i} 扇 · ${ZONE_LABEL[zk]}（上下对称，选一次即两处一起配）`
              }
            >
              {isActive && <span className="zone-tag">{leaf.i}-{ZONE_LABEL[zk]}</span>}
              {has && (
                <span
                  className="zone-x"
                  role="button"
                  aria-label="取消该压花"
                  title="取消该压花"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClear({ leaf: leaf.i, zone: zk })
                  }}
                >
                  ×
                </span>
              )}
            </button>
          )
        }),
      )}
    </>
  )
}
