import { useMemo } from 'react'
import type { FaceSpec, Selection } from '../../types'
import { resolveBox } from '../../types'
import type { PartKey } from '../../state/reducer'

export const PART_LABEL: Record<PartKey, string> = {
  head: '门头',
  pillarL: '左门柱',
  pillarR: '右门柱',
  lockL: '左门锁',
  lockR: '右门锁',
}

interface Props {
  face: FaceSpec
  sel: Selection
  onPick: (part: PartKey) => void
  onClear: (part: PartKey) => void
}

/** 该部件是否已选中 */
export function isPartSelected(sel: Selection, p: PartKey): boolean {
  if (p === 'head') return Boolean(sel.head)
  if (p === 'pillarL' || p === 'pillarR') return Boolean(sel.pillarL)
  return Boolean(sel.lock)
}

/**
 * 门头 / 门柱 / 门锁 的可选框
 *
 * 坐标：元素框是「相对门框」的比例 -> resolveBox 换算成画布绝对比例。
 */
export default function PartBoxLayer({ face, sel, onPick, onClear }: Props) {
  const frame = face.frame

  const boxes = useMemo(() => {
    const abs = (b: Parameters<typeof resolveBox>[1]) => {
      const r = resolveBox(frame, b)
      return {
        left: `${r.x0 * 100}%`,
        width: `${(r.x1 - r.x0) * 100}%`,
        top: `${r.y0 * 100}%`,
        height: `${(r.y1 - r.y0) * 100}%`,
      }
    }
    const lockAbs = (b: { x0: number; x1: number; y0: number; y1: number }) => ({
      left: `${b.x0 * 100}%`,
      width: `${(b.x1 - b.x0) * 100}%`,
      top: `${(frame.y0 + b.y0 * (frame.y1 - frame.y0)) * 100}%`,
      height: `${(b.y1 - b.y0) * (frame.y1 - frame.y0) * 100}%`,
    })
    return [
      { key: 'head' as PartKey, style: abs(face.headBox) },
      { key: 'pillarL' as PartKey, style: abs(face.pillarL) },
      { key: 'pillarR' as PartKey, style: abs(face.pillarR) },
      { key: 'lockL' as PartKey, style: lockAbs(face.lockL) },
      { key: 'lockR' as PartKey, style: lockAbs(face.lockR) },
    ]
  }, [face, frame])

  return (
    <>
      {boxes.map((b) => {
        const picked = isPartSelected(sel, b.key)
        return (
          <button
            key={b.key}
            className={`zone part ${picked ? 'picked' : ''}`}
            style={b.style}
            onClick={(e) => {
              e.stopPropagation()
              onPick(b.key)
            }}
            title={`选择${PART_LABEL[b.key]}`}
          >
            <span className="zone-tag">{PART_LABEL[b.key]}</span>
            {picked && (
              <span
                className="zone-x"
                role="button"
                aria-label={`取消${PART_LABEL[b.key]}`}
                title={`取消${PART_LABEL[b.key]}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClear(b.key)
                }}
              >
                ×
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}
