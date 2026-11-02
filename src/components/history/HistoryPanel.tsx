import { useEffect, useState } from 'react'
import {
  fetchHistory,
  purgeHistory,
  restoreHistory,
  trashHistory,
  type HistoryItem,
} from '../../lib/history'

interface Props {
  open: boolean
  onClose: () => void
  onApply: (item: HistoryItem) => void
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function HistoryPanel({ open, onClose, onApply }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<HistoryItem | null>(null)
  const [tab, setTab] = useState<'active' | 'trash'>('active')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  /** 提示语统一走这里：无论成功还是失败，2.2 秒后自动消失（否则错误会一直挂在屏幕上） */
  const flash = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 2200)
  }

  const reload = async (which: 'active' | 'trash') => {
    setLoading(true)
    try {
      setItems(await fetchHistory(which === 'trash'))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setTab('active')
    setDetail(null)
    reload('active')
  }, [open])

  const switchTab = (t: 'active' | 'trash') => {
    setTab(t)
    setDetail(null)
    reload(t)
  }

  const onTrash = async (it: HistoryItem) => {
    if (!confirm(`把「${fmtTime(it.createdAt)}」这张效果图移入回收站？\n（可从回收站恢复）`)) return
    setBusy(true)
    try {
      await trashHistory(it.id)
      flash('已移入回收站')
      reload('active')
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onRestore = async (it: HistoryItem) => {
    setBusy(true)
    try {
      await restoreHistory(it.id)
      flash('已恢复')
      reload('trash')
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onPurge = async (it: HistoryItem) => {
    if (!confirm(`彻底删除「${fmtTime(it.createdAt)}」？\n\n此操作不可恢复，图片文件会被永久移除。`)) return
    setBusy(true)
    try {
      await purgeHistory(it.id)
      flash('已彻底删除')
      reload('trash')
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="history-modal" onClick={onClose}>
      <div className="history-box" onClick={(e) => e.stopPropagation()}>
        <div className="history-head">
          <div className="history-tabs">
            <button
              className={`history-tab ${tab === 'active' ? 'on' : ''}`}
              onClick={() => switchTab('active')}
            >
              生成历史
            </button>
            <button
              className={`history-tab ${tab === 'trash' ? 'on' : ''}`}
              onClick={() => switchTab('trash')}
            >
              回收站
            </button>
          </div>
          <span className="history-count">{items.length} 张</span>
          {msg && <span className="history-msg">{msg}</span>}
          <button className="zoom-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {loading && <div className="history-empty">加载中…</div>}
        {!loading && items.length === 0 && (
          <div className="history-empty">
            {tab === 'active'
              ? '还没有生成记录。点「生成效果图」后会出现在这里。'
              : '回收站是空的。删除的记录会先放到这里，可以恢复。'}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="history-grid">
            {items.map((it) => (
              <div key={it.id} className="history-cell-wrap">
                <button className="history-cell" onClick={() => setDetail(it)}>
                  <img src={it.file} alt={fmtTime(it.createdAt)} loading="lazy" />
                  <span className="history-time">{fmtTime(it.createdAt)}</span>
                  {it.config?.face && <span className="history-face">{it.config.face}</span>}
                </button>
                {tab === 'active' ? (
                  <button
                    className="history-del"
                    onClick={() => onTrash(it)}
                    disabled={busy}
                    title="移入回收站"
                    aria-label="移入回收站"
                  >
                    🗑
                  </button>
                ) : (
                  <div className="history-trash-ops">
                    <button onClick={() => onRestore(it)} disabled={busy}>
                      恢复
                    </button>
                    <button className="danger" onClick={() => onPurge(it)} disabled={busy}>
                      彻底删
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {detail && (
          <div className="history-detail" onClick={() => setDetail(null)}>
            <div className="history-detail-box" onClick={(e) => e.stopPropagation()}>
              <div className="history-head">
                <span>{fmtTime(detail.createdAt)}</span>
                {detail.deletedAt && <span className="history-deleted-tag">回收站中</span>}
                <button className="zoom-close" onClick={() => setDetail(null)} aria-label="关闭">
                  ×
                </button>
              </div>
              <div className="history-detail-img">
                <img src={detail.file} alt="历史效果图" />
              </div>
              <div className="history-detail-foot">
                <div className="history-sum">
                  {detail.config?.face && <span>门面 {detail.config.face}</span>}
                  {detail.config?.head && <span>门头 {detail.config.head}</span>}
                  {detail.config?.pillarL && <span>门柱 {detail.config.pillarL}</span>}
                  {detail.config?.lock && <span>门锁 {detail.config.lock}</span>}
                  {detail.config?.color && <span>颜色 {detail.config.color}</span>}
                  {detail.config?.emboss && Object.keys(detail.config.emboss).length > 0 && (
                    <span>压花 {Object.keys(detail.config.emboss).length} 处</span>
                  )}
                </div>
                <div className="history-actions">
                  {detail.deletedAt ? (
                    <>
                      <button className="btn primary" onClick={() => onRestore(detail)} disabled={busy}>
                        恢复
                      </button>
                      <button className="btn danger" onClick={() => onPurge(detail)} disabled={busy}>
                        彻底删除
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn primary"
                        onClick={() => {
                          onApply(detail)
                          onClose()
                        }}
                      >
                        套用这组配置
                      </button>
                      <a className="btn" href={detail.file} download>
                        下载原图
                      </a>
                    </>
                  )}
                  <button className="btn" onClick={() => setDetail(null)}>
                    返回
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
