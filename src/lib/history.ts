import type { ZoneKey } from '../types'
import { apiFetch } from './api'

export interface HistoryConfig {
  face?: string
  head?: string | null
  pillarL?: string | null
  pillarR?: string | null
  lock?: string | null
  color?: string | null
  emboss?: Record<string, string>
  slots?: { leaf: number; zone: ZoneKey }[]
}

export interface HistoryItem {
  id: string
  file: string
  createdAt: string
  elapsedMs?: number
  size?: string
  prompt?: string
  /** 软删标记：有值 = 在回收站 */
  deletedAt?: string | null
  config?: HistoryConfig | null
}

async function call(url: string, init?: RequestInit) {
  const res = await apiFetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `请求失败 ${res.status}`)
  return json
}

/** 拉取历史；trash=true 取回收站 */
export async function fetchHistory(trash = false): Promise<HistoryItem[]> {
  const json = await call(`/api/history${trash ? '?trash=1' : ''}`)
  return json.items ?? []
}

/** 移入回收站（软删，文件保留） */
export async function trashHistory(id: string) {
  return call(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 从回收站恢复 */
export async function restoreHistory(id: string) {
  return call(`/api/history/${encodeURIComponent(id)}/restore`, { method: 'POST' })
}

/** 彻底删除（不可恢复） */
export async function purgeHistory(id: string) {
  return call(`/api/history/${encodeURIComponent(id)}/purge`, { method: 'DELETE' })
}
