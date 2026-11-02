import { useCallback, useState } from 'react'
import type { Catalog, FaceSpec, Selection, Slot } from '../types'
import { buildPrompt, collectRefs, composePreview } from '../lib/compose'
import { useAppDispatch } from '../state/AppStateProvider'
import { actions } from '../state/reducer'

/**
 * 生成效果图流程
 *
 * 1. 合成底图（Canvas）
 * 2. 收集参考图（去重 + 截断到 9 张）
 * 3. 调后端 /api/generate（后端注入 ARK Key）
 * 4. 写历史索引（含配置快照）
 */
export function useGenerate(
  face: FaceSpec | null,
  sel: Selection,
  slots: Slot[],
  catalog: Catalog | null,
) {
  const dispatch = useAppDispatch()
  const [busy, setBusy] = useState(false)

  const generate = useCallback(async () => {
    if (!face || !catalog) return
    setBusy(true)
    dispatch(actions.setError(null))
    dispatch(actions.setResult(null))
    try {
      const composed = await composePreview(face, sel, catalog, {
        width: 1400,
        forAI: true,
      })
      const refs = await collectRefs(sel, catalog)
      const refIndex = new Map(refs.map((r, i) => [r.key, i + 2]))
      const prompt = buildPrompt(face, sel, catalog, refIndex)
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          images: [composed, ...refs.map((r) => r.dataUri)],
          size: '2K',
          // 配置快照：历史面板可回看 / 套用
          config: {
            face: sel.face,
            head: sel.head,
            pillarL: sel.pillarL,
            pillarR: sel.pillarR,
            lock: sel.lock,
            color: sel.color,
            emboss: sel.emboss,
            slots,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '生成失败')
      dispatch(actions.setResult(json.url))
    } catch (e) {
      dispatch(actions.setError(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }, [face, sel, slots, catalog, dispatch])

  return { busy, generate }
}
