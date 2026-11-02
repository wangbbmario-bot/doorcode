import { useEffect, useState } from 'react'
import type { Catalog, FaceSpec, Selection } from '../types'
import { composePreview } from '../lib/compose'

/**
 * 实时合成预览（防抖 180ms）
 *
 * 选完元素后自动重算预览；组件卸载/配置变化时不提交过期结果。
 */
export function usePreview(
  face: FaceSpec | null,
  sel: Selection,
  catalog: Catalog | null,
) {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!face || !catalog) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const url = await composePreview(face, sel, catalog, { width: 1200 })
        if (alive) setPreview(url)
      } catch (e) {
        console.error('[preview] 合成失败', e)
      }
    }, 180)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [face, sel, catalog])

  return preview
}
