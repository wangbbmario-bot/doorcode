/**
 * 统一的 API 请求封装
 *
 * 线上部署时后端可能开了访问口令（SITE_PASSWORD）：
 *  - 口令放在 URL 的 ?k=xxx 上，首次进入会自动存进 localStorage 并从地址栏抹掉
 *  - 之后每次请求都带上 x-site-password 头
 *  - 遇到 401 说明口令不对/没输，弹框让用户输，输对后自动重试
 */

const KEY_STORE = 'dk_k'

/** 从地址栏 ?k=xxx 取口令并存下来（然后把地址栏抹干净） */
export function grabKeyFromUrl(): string | null {
  try {
    const m = location.search.match(/[?&]k=([^&]+)/)
    if (!m) return null
    const k = decodeURIComponent(m[1])
    localStorage.setItem(KEY_STORE, k)
    history.replaceState(null, '', location.pathname + location.hash)
    return k
  } catch {
    return null
  }
}

function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) || ''
  } catch {
    return ''
  }
}

/** 让用户输入口令（只在确实被拒时调用一次） */
function askKey(): string | null {
  const input = window.prompt('请输入访问口令')
  if (input === null) return null
  const k = input.trim()
  if (!k) return null
  try {
    localStorage.setItem(KEY_STORE, k)
  } catch {
    /* ignore */
  }
  return k
}

/**
 * 带口令的 fetch：遇到 401 会问一次口令并重试。
 */
export async function apiFetch(input: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers || {})
  const k = storedKey()
  if (k) headers.set('x-site-password', k)
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401 && retry) {
    const ok = askKey()
    if (ok) return apiFetch(input, init, false)
  }
  return res
}
