import type { ReactNode } from 'react'
import type { FaceSpec } from '../../types'
import { useStageSize } from '../../hooks/useStageSize'

interface Props {
  face: FaceSpec
  /** 当前显示的图（合成预览或 AI 结果） */
  src: string | null
  /** 叠加在舞台上的交互层 */
  children?: ReactNode
}

/**
 * 舞台：按门面原始比例缩放，并提供绝对定位的坐标系。
 * 所有选框都用画布百分比定位，所以这里只负责"给出正确的大小"。
 */
export default function StageCanvas({ face, src, children }: Props) {
  const { ref, box } = useStageSize(face.w / face.h)

  return (
    <div className="stage-wrap" ref={ref}>
      <div className="stage" style={{ width: box.w || undefined, height: box.h || undefined }}>
        {src && <img className="stage-img" src={src} alt="效果图" />}
        {children}
      </div>
    </div>
  )
}
