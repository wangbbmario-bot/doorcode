import { useState } from 'react'
import type { FaceSpec, Selection, Slot } from '../../types'
import type { ConfigEntry } from '../../lib/selection'
import { ZONE_LABEL } from '../../types'
import { MAX_REF_IMAGES } from '../../lib/compose'
import { leftHalfCount } from '../../lib/selection'
import type { PartKey } from '../../state/reducer'
import ConfigPanel from '../config/ConfigPanel'
import StageCanvas from './StageCanvas'
import PartBoxLayer from './PartBoxLayer'
import EmbossZoneLayer from './EmbossZoneLayer'

interface Props {
  face: FaceSpec
  sel: Selection
  slots: Slot[]
  preview: string | null
  result: string | null
  busy: boolean
  error: string | null
  refPlan: { sent: string[]; dropped: string[] }
  configEntries: ConfigEntry[]
  onToggleSlot: (s: Slot) => void
  onClearSlot: (s: Slot) => void
  onPickPart: (part: PartKey) => void
  onClearPart: (part: PartKey) => void
  onClearConfig: (entry: ConfigEntry) => void
  onClearAllConfig: () => void
  onGenerate: () => void
  onSave: () => void
  onOpenHistory: () => void
}

/**
 * 效果展示区（左栏）
 *
 * 结构：顶栏 + 舞台（底图 + 两层选框）+ 底栏
 * 选框逻辑分别在 PartBoxLayer / EmbossZoneLayer 里。
 */
export default function PreviewPane({
  face,
  sel,
  slots,
  preview,
  result,
  busy,
  error,
  refPlan,
  configEntries,
  onToggleSlot,
  onClearSlot,
  onPickPart,
  onClearPart,
  onClearConfig,
  onClearAllConfig,
  onGenerate,
  onSave,
  onOpenHistory,
}: Props) {
  const [showZones, setShowZones] = useState(true)
  const src = result ?? preview

  return (
    <div className="preview-pane">
      <div className="preview-head">
        <span className="brand">响当当 XDD · 铜门定制</span>
        <span className="face-name">{face.key}</span>
        <span className="sym-note" title="门扇左右轴对称，只需配置左半，右半自动镜像">
          左右对称 · 配左半 {leftHalfCount(face)} 扇
        </span>
        <label className="zone-toggle">
          <input
            type="checkbox"
            checked={showZones}
            onChange={(e) => setShowZones(e.target.checked)}
          />
          显示可选位置
        </label>
      </div>

      <div className="stage-area">
        <ConfigPanel
          entries={configEntries}
          pendingSlots={slots.length}
          onClear={onClearConfig}
          onClearAll={onClearAllConfig}
        />
        <StageCanvas face={face} src={src}>
          {!result && showZones && (
            <>
              <PartBoxLayer face={face} sel={sel} onPick={onPickPart} onClear={onClearPart} />
              <EmbossZoneLayer
                face={face}
                sel={sel}
                slots={slots}
                onToggle={onToggleSlot}
                onClear={onClearSlot}
              />
            </>
          )}
        </StageCanvas>
      </div>

      <div className="preview-foot">
        <button className="btn primary" onClick={onGenerate} disabled={busy}>
          {busy ? '生成中…' : '生成效果图'}
        </button>
        <button className="btn" onClick={onSave} disabled={!result}>
          保存到相册
        </button>
        <button className="btn" onClick={onOpenHistory}>
          生成历史
        </button>
        {slots.length > 0 && (
          <span className="hint">
            已选 {slots.length} 个位置：
            {slots.map((s) => `${s.leaf}-${ZONE_LABEL[s.zone]}`).join('、')}
          </span>
        )}
        {refPlan.dropped.length > 0 && (
          <span
            className="hint warn"
            title="Seedream 5.0 Flash 单次最多 10 张参考图；未发出的纹样在合成底图里已画出，AI 仍会按位置写实化"
          >
            参考图 {refPlan.sent.length}/{MAX_REF_IMAGES} 张，{refPlan.dropped.length} 种纹样未单独发送（底图已含，AI 照底图写实化）
          </span>
        )}
      </div>

      {error && <div className="error-bar">{error}</div>}
    </div>
  )
}
