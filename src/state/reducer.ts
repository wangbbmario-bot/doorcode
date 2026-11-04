import type { Catalog, CatalogItem, Faces, Selection, Slot, ZoneKey } from '../types'
import type { ConfigEntry, HistoryConfig } from '../lib/selection'
import {
  applyEmboss,
  applyHistoryConfig,
  clearConfigEntry,
  clearEmboss,
  pruneRightHalf,
  switchFace,
  toggleChoice,
  toggleSlot,
} from '../lib/selection'

/** 门头/门柱/门锁的选框标识 */
export type PartKey = 'head' | 'pillarL' | 'pillarR' | 'lockL' | 'lockR'

export interface AppState {
  /** 素材索引（加载后） */
  catalog: Catalog | null
  /** 门面几何（加载后） */
  faces: Faces | null
  /** 当前配置 */
  sel: Selection
  /** 当前待选的压花位置 */
  slots: Slot[]
  /** 右侧当前分类 */
  activeCat: string
  /** 搜索词 */
  query: string
  /** 收藏（`分类:名称`） */
  favs: string[]
  /** 分栏左栏占比 % */
  split: number
  /** 实时合成预览（data URL） */
  preview: string | null
  /** AI 生成结果（URL） */
  result: string | null
  /** 初始化是否完成（完成后才允许持久化） */
  ready: boolean
  /** 历史面板是否打开 */
  historyOpen: boolean
  /** 生成中 */
  busy: boolean
  /** 错误提示 */
  error: string | null
}

export type Action =
  | { type: 'boot'; catalog: Catalog; faces: Faces; restored: { sel: Selection; slots: Slot[] } | null }
  | { type: 'toggleSlot'; slot: Slot }
  | { type: 'pickAsset'; cat: string; item: CatalogItem }
  | { type: 'clearSlot'; slot: Slot }
  | { type: 'clearPart'; part: PartKey }
  | { type: 'clearConfig'; entry: ConfigEntry }
  | { type: 'clearAllConfig' }
  | { type: 'applyHistory'; config: HistoryConfig | null | undefined }
  | { type: 'setActiveCat'; cat: string }
  | { type: 'setQuery'; query: string }
  | { type: 'toggleFav'; cat: string; name: string }
  | { type: 'setFavs'; favs: string[] }
  | { type: 'setSplit'; pct: number }
  | { type: 'setPreview'; preview: string | null }
  | { type: 'setResult'; result: string | null }
  | { type: 'setBusy'; busy: boolean }
  | { type: 'setError'; error: string | null }
  | { type: 'openHistory' }
  | { type: 'closeHistory' }

export const initialState: AppState = {
  catalog: null,
  faces: null,
  sel: {
    face: '六扇门',
    head: null,
    pillarL: null,
    pillarR: null,
    lock: null,
    color: null,
    emboss: {},
  },
  slots: [],
  activeCat: 'face',
  query: '',
  favs: [],
  // 注：真正的分栏比例在 hooks/useSplitDrag.ts（这个字段是历史遗留，没被用到）
  split: 50,
  preview: null,
  result: null,
  ready: false,
  historyOpen: false,
  busy: false,
  error: null,
}

/** 分类 -> 门面分类 key（门面名即 faces 的 key） */
const FACE_CATEGORY = 'face'

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'boot': {
      const { catalog, faces, restored } = action
      if (restored && restored.sel.face && faces[restored.sel.face]) {
        const spec = faces[restored.sel.face]
        return {
          ...state,
          catalog,
          faces,
          // 左右对称模型：清理早期版本存下的右半压花
          sel: pruneRightHalf(restored.sel, spec),
          slots: restored.slots ?? [],
          ready: true,
        }
      }
      return { ...state, catalog, faces, ready: true }
    }

    case 'toggleSlot':
      return { ...state, slots: toggleSlot(state.slots, action.slot) }

    case 'pickAsset': {
      const { cat, item } = action
      if (cat === FACE_CATEGORY) {
        const spec = state.faces?.[item.name]
        const sw = switchFace(state.sel, item.name)
        return {
          ...state,
          slots: [],
          sel: spec ? pruneRightHalf(sw, spec) : sw,
          result: null,
        }
      }
      if (cat === 'emboss') {
        // 必须先选好门面位置，再选压花类型
        if (state.slots.length === 0) {
          return { ...state, error: '请先在左侧点击要放压花的位置（上 / 中 / 下），再选择压花类型' }
        }
        return {
          ...state,
          sel: { ...state.sel, emboss: applyEmboss(state.sel.emboss, state.slots, item.name) },
          slots: [], // 应用后重置待选位置
          result: null,
        }
      }
      const sel = { ...state.sel }
      if (cat === 'head') sel.head = toggleChoice(sel.head, item.name)
      if (cat === 'pillar') {
        const v = toggleChoice(sel.pillarL, item.name)
        sel.pillarL = v
        sel.pillarR = v
      }
      if (cat === 'lock') sel.lock = toggleChoice(sel.lock, item.name)
      if (cat === 'color') sel.color = toggleChoice(sel.color, item.name)
      return { ...state, sel, result: null }
    }

    case 'clearSlot':
      return {
        ...state,
        sel: { ...state.sel, emboss: clearEmboss(state.sel.emboss, action.slot) },
        result: null,
      }

    case 'clearPart': {
      const sel = { ...state.sel }
      if (action.part === 'head') sel.head = null
      else if (action.part.startsWith('pillar')) {
        sel.pillarL = null
        sel.pillarR = null
      } else sel.lock = null
      return { ...state, sel, result: null }
    }

    case 'clearConfig':
      return { ...state, sel: clearConfigEntry(state.sel, action.entry), result: null }

    case 'clearAllConfig': {
      // 清空所有已配置项，但保留门面选择
      const spec = state.faces?.[state.sel.face]
      const cleared: Selection = {
        ...state.sel,
        head: null,
        pillarL: null,
        pillarR: null,
        lock: null,
        color: null,
        emboss: {},
      }
      return {
        ...state,
        slots: [],
        sel: spec ? pruneRightHalf(cleared, spec) : cleared,
        result: null,
      }
    }

    case 'applyHistory':
      return {
        ...state,
        sel: applyHistoryConfig(state.sel, action.config),
        slots: [],
        result: null,
      }

    case 'setActiveCat':
      return { ...state, activeCat: action.cat }

    case 'setQuery':
      return { ...state, query: action.query }

    case 'toggleFav': {
      const key = `${action.cat}:${action.name}`
      const favs = state.favs.includes(key)
        ? state.favs.filter((x) => x !== key)
        : [...state.favs, key]
      return { ...state, favs }
    }

    case 'setFavs':
      return { ...state, favs: action.favs }

    case 'setSplit':
      return { ...state, split: Math.min(80, Math.max(20, action.pct)) }

    case 'setPreview':
      return { ...state, preview: action.preview }

    case 'setResult':
      return { ...state, result: action.result }

    case 'setBusy':
      return { ...state, busy: action.busy }

    case 'setError':
      return { ...state, error: action.error }

    case 'openHistory':
      return { ...state, historyOpen: true }

    case 'closeHistory':
      return { ...state, historyOpen: false }

    default:
      return state
  }
}

/* ---------------- action creators ---------------- */

export const actions = {
  boot: (catalog: Catalog, faces: Faces, restored: { sel: Selection; slots: Slot[] } | null): Action => ({
    type: 'boot',
    catalog,
    faces,
    restored,
  }),
  toggleSlot: (slot: Slot): Action => ({ type: 'toggleSlot', slot }),
  pickAsset: (cat: string, item: CatalogItem): Action => ({ type: 'pickAsset', cat, item }),
  clearSlot: (slot: Slot): Action => ({ type: 'clearSlot', slot }),
  clearPart: (part: PartKey): Action => ({ type: 'clearPart', part }),
  clearConfig: (entry: ConfigEntry): Action => ({ type: 'clearConfig', entry }),
  clearAllConfig: (): Action => ({ type: 'clearAllConfig' }),
  applyHistory: (config: HistoryConfig | null | undefined): Action => ({ type: 'applyHistory', config }),
  setActiveCat: (cat: string): Action => ({ type: 'setActiveCat', cat }),
  setQuery: (query: string): Action => ({ type: 'setQuery', query }),
  toggleFav: (cat: string, name: string): Action => ({ type: 'toggleFav', cat, name }),
  setFavs: (favs: string[]): Action => ({ type: 'setFavs', favs }),
  setSplit: (pct: number): Action => ({ type: 'setSplit', pct }),
  setPreview: (preview: string | null): Action => ({ type: 'setPreview', preview }),
  setResult: (result: string | null): Action => ({ type: 'setResult', result }),
  setBusy: (busy: boolean): Action => ({ type: 'setBusy', busy }),
  setError: (error: string | null): Action => ({ type: 'setError', error }),
  openHistory: (): Action => ({ type: 'openHistory' }),
  closeHistory: (): Action => ({ type: 'closeHistory' }),
}

/** 部件选框 -> 右侧分类 */
export function partToCategory(part: PartKey): string {
  if (part === 'head') return 'head'
  if (part.startsWith('pillar')) return 'pillar'
  return 'lock'
}

export type { ZoneKey }
