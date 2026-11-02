import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { actions, initialState, reducer, type Action, type AppState } from './reducer'
import { loadCatalog, loadFaces } from '../lib/data'
import type { Faces, Selection, Slot } from '../types'

const SEL_KEY = 'xdd:selection'
const FAV_KEY = 'xdd:favs'

const StateCtx = createContext<AppState>(initialState)
const DispatchCtx = createContext<React.Dispatch<Action>>(() => {})

/** 读 localStorage（容错） */
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/**
 * 全局状态 Provider
 *
 * 约定：
 * - 所有状态变更只能通过 dispatch(action)，**组件不要自己 setState 改共享状态**
 * - 组件用 useAppState() 读状态，用 useAppDispatch() 派发 action
 * - 持久化在这里统一做，组件不碰 localStorage
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // 初始化：素材 + 几何 + 恢复上次配置
  useEffect(() => {
    let alive = true
    Promise.all([loadCatalog(), loadFaces()])
      .then(([catalog, faces]) => {
        if (!alive) return
        const restored = readJSON<{ sel: Selection; slots: Slot[] } | null>(SEL_KEY, null)
        dispatch(actions.boot(catalog, faces, restored))
        const favs = readJSON<string[]>(FAV_KEY, [])
        if (favs.length) dispatch(actions.setFavs(favs))
      })
      .catch((e) => dispatch(actions.setError(String(e))))
    return () => {
      alive = false
    }
  }, [])

  // 持久化：初始化完成之后才写，避免默认值覆盖用户配置
  useEffect(() => {
    if (!state.ready) return
    try {
      localStorage.setItem(SEL_KEY, JSON.stringify({ sel: state.sel, slots: state.slots }))
    } catch {
      /* ignore */
    }
  }, [state.sel, state.slots, state.ready])

  useEffect(() => {
    if (!state.ready) return
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(state.favs))
    } catch {
      /* ignore */
    }
  }, [state.favs, state.ready])

  // 错误提示 2.6 秒后自动消失
  useEffect(() => {
    if (!state.error) return
    const t = setTimeout(() => dispatch(actions.setError(null)), 2600)
    return () => clearTimeout(t)
  }, [state.error])

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  )
}

export const useAppState = () => useContext(StateCtx)
export const useAppDispatch = () => useContext(DispatchCtx)

/** 常用派生数据（组件直接用，不用自己算） */
export function useDerived() {
  const state = useAppState()
  return useMemo(() => {
    const face = state.faces?.[state.sel.face] ?? null
    const favs = new Set(state.favs)
    return { ...state, face, favSet: favs }
  }, [state])
}

export type { Faces }
