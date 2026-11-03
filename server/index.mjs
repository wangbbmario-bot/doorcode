#!/usr/bin/env node
/**
 * 响当当 XDD 铜门定制 —— 后端
 *
 *  1. 静态托管 dist/（生产）
 *  2. /api/generate   代理火山方舟 Seedream 5.0 Flash 图片生成
 *  3. /api/health     健康检查
 *
 * API Key 只从环境变量 / .env 读取，绝不进入前端 bundle。
 */
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = process.env.PORT || 8787
const OUT_DIR = path.join(ROOT, 'server', 'generated')

// ---- 读取 .env（极简实现） ----
const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const ARK_KEY = process.env.ARK_API_KEY || ''
const ARK_MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-flash-260915'
const ARK_ENDPOINT = process.env.ARK_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

/**
 * 访问口令（可选）
 *
 * 部署到公网后，/api/generate 就是一个**会烧 ARK 额度**的公开接口，
 * /api/history 会暴露所有人的效果图与配置记录。
 * 设置 SITE_PASSWORD 后全站需要口令；不设置则不启用（本地开发无感）。
 *
 * 两种传法：请求头 x-site-password，或 cookie dk_k。
 * 前端会把 URL 上的 ?k=口令 存进 localStorage 并从地址栏抹掉。
 */
const SITE_PASSWORD = process.env.SITE_PASSWORD || ''

function authOk(req) {
  if (!SITE_PASSWORD) return true
  const h = req.get('x-site-password')
  if (h && h === SITE_PASSWORD) return true
  const cookie = req.headers.cookie || ''
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === 'dk_k' && decodeURIComponent(v.join('=')) === SITE_PASSWORD) return true
  }
  return false
}

fs.mkdirSync(OUT_DIR, { recursive: true })

const { readHistory, readTrash, pushHistory, softDeleteHistory, restoreHistory, purgeHistory } =
  await import('./history.mjs')

const app = express()
app.use(express.json({ limit: '64mb' }))

// 访问口令闸门（未设置 SITE_PASSWORD 时直接放行）
app.use((req, res, next) => {
  if (authOk(req)) return next()
  res.status(401).json({ error: '需要访问口令', needAuth: true })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: ARK_MODEL, keyConfigured: Boolean(ARK_KEY) })
})

/** 历史生成记录（倒序）；?trash=1 只返回回收站里的 */
app.get('/api/history', (req, res) => {
  const items = req.query.trash === '1' ? readTrash(OUT_DIR) : readHistory(OUT_DIR)
  res.json({ ok: true, items })
})

/** 软删：移入回收站（文件保留，可恢复） */
app.delete('/api/history/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/[^\w.-]/g, '')
  if (!id) return res.status(400).json({ error: '缺少 id' })
  const rec = softDeleteHistory(OUT_DIR, id)
  if (!rec) return res.status(404).json({ error: '记录不存在或已在回收站' })
  res.json({ ok: true, id: rec.id, deletedAt: rec.deletedAt })
})

/** 从回收站恢复 */
app.post('/api/history/:id/restore', (req, res) => {
  const id = String(req.params.id || '').replace(/[^\w.-]/g, '')
  if (!id) return res.status(400).json({ error: '缺少 id' })
  const rec = restoreHistory(OUT_DIR, id)
  if (!rec) return res.status(404).json({ error: '记录不存在或不在回收站' })
  res.json({ ok: true, id: rec.id })
})

/** 彻底删除：移出索引 + 删文件（不可恢复） */
app.delete('/api/history/:id/purge', (req, res) => {
  const id = String(req.params.id || '').replace(/[^\w.-]/g, '')
  if (!id) return res.status(400).json({ error: '缺少 id' })
  const rec = purgeHistory(OUT_DIR, id)
  if (!rec) return res.status(404).json({ error: '记录不存在' })
  res.json({ ok: true, id: rec.id })
})

/**
 * 生成效果图
 * body: { prompt: string, images: string[] (data URI 或 URL), size?: string, config?: object }
 */
app.post('/api/generate', async (req, res) => {
  if (!ARK_KEY) {
    return res.status(500).json({ error: 'ARK_API_KEY 未配置（检查 .env）' })
  }
  let { prompt, images = [], size = '2K' } = req.body || {}
  if (!prompt) return res.status(400).json({ error: '缺少 prompt' })

  // Seedream 5.0 Flash 最多 10 张参考图（含合成底图 1 张）
  // 兜底截断，避免前端漏算导致 400
  const MAX_IMAGES = 10
  if (images.length > MAX_IMAGES) {
    console.warn(`[generate] 参考图 ${images.length} 张，超出上限，截断为 ${MAX_IMAGES} 张`)
    images = images.slice(0, MAX_IMAGES)
  }

  const callArk = async (p) => {
    const body = {
      model: ARK_MODEL,
      prompt: p,
      image: images,
      size,
      response_format: 'url',
      watermark: false,
    }
    const r = await fetch(ARK_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ARK_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, status: 502, json: { error: { message: '上游返回非 JSON', detail: text.slice(0, 400) } }, prompt: p }
    }
    return { ok: r.ok, status: r.status, json, prompt: p }
  }

  try {
    const t0 = Date.now()
    let out = await callArk(prompt)

    // 兜底 1：输入审核误判（产品型号编号等被当成敏感标识）-> 去掉编号后重试
    if (!out.ok && out.json?.error?.code === 'InputTextSensitiveContentDetected') {
      console.warn('[generate] 输入审核误判，去掉编号后重试')
      const safe = prompt
        .replace(/XDD[-_]?\d+/gi, '')
        .replace(/\b\d{3,}\b/g, '')
        .replace(/「\s*」/g, '')
        .replace(/[（(][^）)]*[）)]/g, '')
      out = await callArk(safe)
    }

    // 兜底 2：上游瞬时故障 -> 重试一次
    if (!out.ok && [500, 502, 503, 429].includes(out.status)) {
      console.warn(`[generate] 上游 ${out.status}，重试一次`)
      await new Promise((r) => setTimeout(r, 2500))
      out = await callArk(prompt)
    }

    const ms = Date.now() - t0
    if (!out.ok) {
      return res.status(out.status).json({
        error: out.json?.error?.message || '上游错误',
        detail: out.json,
      })
    }

    const remoteUrl = out.json?.data?.[0]?.url
    if (!remoteUrl) return res.status(502).json({ error: '上游未返回图片', detail: out.json })

    // 下载并落地保存，保证 24h 后依然可访问/保存到相册
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`
    let localUrl = remoteUrl
    try {
      const imgRes = await fetch(remoteUrl)
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer())
        fs.writeFileSync(path.join(OUT_DIR, id), buf)
        localUrl = `/generated/${id}`
      }
    } catch (e) {
      console.warn('[generate] 本地落地失败，回退远端 URL:', e.message)
    }

    // 写入历史索引（含配置快照，便于回看 / 复用）
    const rec = {
      id: path.basename(id, '.jpg'),
      file: localUrl,
      createdAt: new Date().toISOString(),
      elapsedMs: ms,
      size: out.json?.data?.[0]?.size,
      usage: out.json?.usage,
      prompt: out.prompt ?? prompt,
      config: req.body?.config ?? null,
    }
    try {
      pushHistory(OUT_DIR, rec)
    } catch (e) {
      console.warn('[generate] 写历史索引失败:', e.message)
    }

    res.json({
      ok: true,
      url: localUrl,
      remoteUrl,
      size: out.json?.data?.[0]?.size,
      usage: out.json?.usage,
      elapsedMs: ms,
      id: rec.id,
    })
  } catch (e) {
    console.error('[generate] 失败:', e.message, e.cause?.message || '', e.cause?.code || '')
    res.status(500).json({
      error: e.message,
      cause: e.cause?.message || null,
      code: e.cause?.code || null,
    })
  }
})

// 生产：静态托管
const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api|\/generated).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}
app.use('/generated', express.static(OUT_DIR))

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[doorcode] API 监听 :${PORT}  model=${ARK_MODEL}  key=${ARK_KEY ? '已配置' : '未配置'}`)
  if (!ARK_KEY) console.warn('[doorcode] 请在 .env 中配置 ARK_API_KEY')
})
