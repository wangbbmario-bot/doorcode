import { useCallback, useMemo } from 'react'
import { AppStateProvider, useAppDispatch, useAppState } from './state/AppStateProvider'
import { actions, partToCategory } from './state/reducer'
import { usePreview } from './hooks/usePreview'
import { useGenerate } from './hooks/useGenerate'
import { useSplitDrag } from './hooks/useSplitDrag'
import { buildConfigEntries } from './lib/selection'
import { planRefs } from './lib/compose'
import SplitLayout from './components/layout/SplitLayout'
import PreviewPane from './components/preview/PreviewPane'
import SelectorPane from './components/selector/SelectorPane'
import HistoryPanel from './components/history/HistoryPanel'

/**
 * 应用外壳
 *
 * 这里只做「组装」：把 state / dispatch / hooks 接到各个组件上。
 * 业务规则在 state/reducer.ts，纯逻辑在 lib/，组件只管渲染。
 */
function Shell() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const face = state.faces?.[state.sel.face] ?? null
  const preview = usePreview(face, state.sel, state.catalog)
  const { busy, generate } = useGenerate(face, state.sel, state.slots, state.catalog)
  const { split, startDrag } = useSplitDrag()

  const configEntries = useMemo(
    () => (state.catalog ? buildConfigEntries(state.sel, state.catalog, face ?? undefined) : []),
    [state.sel, state.catalog, face],
  )

  const refPlan = useMemo(
    () => (state.catalog ? planRefs(state.sel, state.catalog) : { sent: [], dropped: [] }),
    [state.sel, state.catalog],
  )

  const favNames = useMemo(() => {
    const prefix = `${state.activeCat}:`
    return new Set(state.favs.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)))
  }, [state.favs, state.activeCat])

  const selectedName = useMemo(() => {
    const map: Record<string, string | null> = {
      face: state.sel.face,
      emboss: null,
      color: state.sel.color,
      head: state.sel.head,
      pillar: state.sel.pillarL,
      lock: state.sel.lock,
    }
    return map[state.activeCat] ?? null
  }, [state.sel, state.activeCat])

  const onPickPart = useCallback(
    (part: Parameters<typeof partToCategory>[0]) => {
      dispatch(actions.setActiveCat(partToCategory(part)))
    },
    [dispatch],
  )

  const onSave = useCallback(async () => {
    if (!state.result) return
    const name = `XDD-铜门-${state.sel.face}-${Date.now()}.jpg`
    try {
      const blob = await (await fetch(state.result)).blob()
      const file = new File([blob], name, { type: 'image/jpeg' })
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean
        share?: (d: ShareData) => Promise<void>
      }
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: name })
        return
      }
    } catch {
      /* 分享失败则回退下载 */
    }
    const a = document.createElement('a')
    a.href = state.result
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [state.result, state.sel.face])

  // 素材 / 几何还没加载完时先占位，避免子组件拿到 null
  if (!state.catalog || !state.faces || !face) {
    return (
      <div className="boot">
        <div className="spinner" />
        <p>正在加载素材…</p>
        {state.error && <p className="error-bar">{state.error}</p>}
      </div>
    )
  }

  return (
    <>
      <SplitLayout
        split={split}
        onDragStart={startDrag}
        left={
          <PreviewPane
            face={face}
            sel={state.sel}
            slots={state.slots}
            preview={preview}
            result={state.result}
            busy={busy}
            error={state.error}
            refPlan={refPlan}
            configEntries={configEntries}
            onToggleSlot={(slot) => dispatch(actions.toggleSlot(slot))}
            onClearSlot={(slot) => dispatch(actions.clearSlot(slot))}
            onPickPart={onPickPart}
            onClearPart={(part) => dispatch(actions.clearPart(part))}
            onClearConfig={(entry) => dispatch(actions.clearConfig(entry))}
            onClearAllConfig={() => dispatch(actions.clearAllConfig())}
            onGenerate={generate}
            onSave={onSave}
            onOpenHistory={() => dispatch(actions.openHistory())}
          />
        }
        right={
          <SelectorPane
            catalog={state.catalog}
            activeCat={state.activeCat}
            onCat={(cat) => dispatch(actions.setActiveCat(cat))}
            query={state.query}
            onQuery={(q) => dispatch(actions.setQuery(q))}
            selectedName={selectedName}
            favNames={favNames}
            slotCount={state.slots.length}
            onPick={(item) => dispatch(actions.pickAsset(state.activeCat, item))}
            onToggleFav={(item) => dispatch(actions.toggleFav(state.activeCat, item.name))}
          />
        }
      />

      <HistoryPanel
        open={state.historyOpen}
        onClose={() => dispatch(actions.closeHistory())}
        onApply={(item) => {
          dispatch(actions.applyHistory(item.config))
          dispatch(actions.setResult(item.file))
        }}
      />
    </>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}
