import type { Catalog, Faces } from '../types'
import { apiFetch } from './api'

const catBase = import.meta.env.BASE_URL || '/'

async function loadJson<T>(path: string): Promise<T> {
  const res = await apiFetch(`${catBase}${path}`)
  if (!res.ok) throw new Error(`加载 ${path} 失败: ${res.status}`)
  return res.json()
}

export const loadCatalog = () => loadJson<Catalog>('catalog.json')
export const loadFaces = () => loadJson<Faces>('faces.json')

export const assetUrl = (p: string) => `${catBase}${p.replace(/^\//, '')}`
