# AGENTS.md — doorcode 项目地图

## 这是什么

佛山市兴东源不锈钢（响当当 XDD 品牌）铜门画册的**在线选配 + AI 出图** App。
销售现场用 iPad / Android Pad 演示（移动端横屏优先），后续可打包 APK。

- 产品形态 / 交互流程 / 生图规则：**飞书文档画板**（`PwZXwA8zRiCyolkDrnjcBcmhnLb`）
- 素材来源：画册方提供的 `材料文件.zip`（2921 个文件，6 个分类）

## 必读的三条硬约束

1. **ARK API Key 只在后端**（`server/index.mjs` 读 `.env`），绝不写进 `src/` 或聊天记录
2. **prompt 里不能出现产品型号编号**（`XDD-1801` / `1816`）→ ARK 输入审核会 400 误杀
3. **Seedream img2img 的图片用 base64 data URI 传入**，不要用公网 URL（内网 bucket 跨区域不通）

## 常用命令

```bash
npm run dev        # 前端 5173 + 后端 8787
npm run build      # 构建到 dist/
npm start          # 生产：Node 托管 dist/ + API
npm run catalog    # 重建素材索引（改素材后）
```

## 代码地图（组件化分层）

```
src/
├─ App.tsx              只做组装：把 state/dispatch/hooks 接到组件上（~160 行）
├─ state/
│  ├─ reducer.ts         **唯一状态真源**：所有状态变更都是这里的一个 case
│  └─ AppStateProvider.tsx  Context + 持久化 + 派生数据
├─ hooks/                有副作用的流程（预览合成 / 生成 / 拖拽 / 尺寸计算）
├─ lib/
│  ├─ selection.ts       纯业务函数（左右对称、配置清单、虚拟滚动计算）
│  └─ compose/           按职责拆 4 个模块
│     ├─ draw.ts            canvas 绘制原语（无业务语义）
│     ├─ preview.ts         实时合成预览
│     ├─ prompt.ts          prompt 生成（含编号清洗）
│     └─ refs.ts            参考图收集与配额
├─ components/
│  ├─ layout/SplitLayout.tsx    两栏 + 可拖动分界线
│  ├─ preview/                  效果展示区
│  │  ├─ PreviewPane.tsx        组合层
│  │  ├─ StageCanvas.tsx        舞台尺寸 + 底图
│  │  ├─ PartBoxLayer.tsx       门头/门柱/门锁选框
│  │  └─ EmbossZoneLayer.tsx    压花槽位热区
│  ├─ selector/                 元素选择区
│  │  ├─ SelectorPane.tsx       组合层（过滤规则在这里）
│  │  ├─ CategoryTabs.tsx / SearchBar.tsx
│  │  ├─ AssetGrid.tsx          虚拟滚动网格
│  │  └─ AssetCell.tsx
│  ├─ config/ConfigPanel.tsx    已配置项浮层
│  ├─ history/HistoryPanel.tsx  生成历史
│  └─ common/ImageViewer.tsx    通用大图弹层
└─ types.ts              类型 + `resolveBox()`
```

| 路径 | 职责 | 改动时机 |
|---|---|---|
| `src/state/reducer.ts` | **所有状态变更的唯一入口** | 加新交互（先加 action，再改组件） |
| `src/lib/selection.ts` | 纯业务规则，可单测 | 改对称/清单/筛选规则 |
| `src/lib/compose/*` | 合成 / prompt / 参考图 | 改生成质量 |
| `src/components/*` | 只渲染，不含业务分支 | 改样式与布局 |
| `server/index.mjs` | 静态托管 + `/api/generate` 代理 + 审核兜底 | 改后端 |
| `server/history.mjs` | 历史索引读写（纯文件操作，可单测） | 改历史存储 |
| `scripts/build_catalog.py` | 素材 → 缩略图 + `catalog.json` + `faces.json` | 改素材处理 |
| `scripts/data/*.json` | 槽位标定源数据 | 改门面图后重标定 |

## 组件化约定（防止改一处崩一片）

1. **状态只走 reducer**：组件**不许**直接 `setState` 改共享状态，
   一律 `dispatch(actions.xxx(...))`。新增交互 = 在 reducer 加一个 case + 加一个 action creator。
2. **业务规则进 `lib/`**：`lib/` 里的函数必须是纯函数、可单测。
   组件里**不允许**出现"如果…就…"的业务分支，只做渲染。
3. **组件自治**：局部 UI 状态（如大图弹层开合）留在组件内部，不上抛。
4. **派生数据在 Provider 算好**：组件不自己算 `configEntries` / `favNames` 这类派生值。
5. **一个组件一个目录**：超过 ~120 行就拆子组件，子组件放在同目录。
6. **改完必须跑 `npm test`**：reducer 的每个 case 都有用例覆盖，
   改 reducer 不会影响别的模块。
7. **组件之间不互相 import 内部实现**：要复用就提到 `lib/` 或 `common/`。

## 素材目录约定

```
材料文件/
├─ 门面类型/   2/4/6/8 扇门渲染图（底图）      → public/assets/face
├─ 门头类型/   门楣横梁（白底）                → public/assets/head
├─ 门柱类型/   门柱竖条（白底）                → public/assets/pillar
├─ 锁类型/     拉手（白底）                     → public/assets/lock
├─ 压花类型/   1324 张浮雕花纹（铜色面板底）    → public/assets/emboss
└─ 颜色类型/   40 张表面质感纹理                → public/assets/color
```

白底素材（门头/门柱/门锁）构建时转成带 alpha 的 PNG，可直接叠到门上；
压花是铜色面板底，合成时按槽位裁切填充。

## 槽位坐标怎么来的

`scripts/data/` 里是检测出来的原始数据：

- `face_spec.json`：每个门扇的横向下标 + 上/中/下纵向区间
- `frames.json`：门框外框 bbox

`build_catalog.py` 把它们和「元素相对门框的比例常数」（`REL`）合成 `public/faces.json`。
`REL` 常数由六扇门 / 八扇门交叉标定得出，改门面图需重新验证。

## 第一轮 BUG 已修（2026-10-31）

画板「door 第一轮BUG」7 条全部修复，详见 README 的修复记录表。

新增/变更的关键文件：
- `scripts/data/leaf_lines.json` —— **门扇边界唯一真源**（人工标定 + 视觉验证）
- `scripts/calibrate_leaves.py` —— 标定校验器，`npm run verify:geometry` 会在底图变更时报错
- `src/lib/selection.ts` —— 选区/虚拟滚动的纯函数（**测试直接覆盖真实代码路径**）
- `tests/*.test.ts` —— 82 个用例，`npm test`

**改门面渲染图后必须重跑 `npm run verify:geometry`**，偏差超 2.5% 会报警。

## 第二轮需求已实现（2026-10-31）

- 门头/门柱/门锁选框带 × 可取消（`PreviewPane` 的 `onClearPart`）
- 压花强制「先选位置 → 再选类型」，应用后重置待选（`selection.ts` 的 `pickEmboss`）
- 右栏底部「我的配置」面板（`components/ConfigPanel.tsx` + `selection.ts` 的
  `buildConfigEntries` / `clearConfigEntry`）

`npm test` 现为 99 个用例，全部覆盖 `src/lib/selection.ts` 的真实实现。

## 第三轮需求已实现（2026-10-31）

门左右轴对称，**只配左半**（2/4/6/8 扇 -> 左半 1/2/3/4 扇）：
- 对称模型在 `src/lib/selection.ts`：`leftHalfCount` / `isLeftHalf` / `mirrorLeaf` /
  `effectiveEmboss` / `pruneRightHalf`
- `sel.emboss` **只存左半**；合成与提示词里右半按镜像推导
- `PreviewPane` 只渲染左半可点框；顶部显示「左右对称 · 配左半 N 扇」

## 门面上/中/下 比例

每扇门面纵向划分固定 **上 10% / 中 80% / 下 10%**（写在 `build_catalog.py` 的 `zones`）。
中段占 80% 是主纹样区，上/下是窄条装饰区。

## 已配置项浮动清单

`components/ConfigPanel.tsx` 渲染在**效果展示区门面图左上角**（半透明），
不是右栏底部。门面图 `.stage-wrap` 改为 `align-items: flex-start` 让浮层能压在门上。

## 生成历史（软删 + 回收站）

`server/history.mjs` 负责索引读写（纯文件操作，可单测），`server/index.mjs` 提供：

| 方法 | 路径 | 语义 |
|---|---|---|
| GET | `/api/history` | 未删记录（倒序） |
| GET | `/api/history?trash=1` | **只有**回收站里的记录 |
| DELETE | `/api/history/:id` | 软删：打 `deletedAt`，文件保留 |
| POST | `/api/history/:id/restore` | 恢复 |
| DELETE | `/api/history/:id/purge` | 彻底删除：移出索引 + 删文件 |

前端 `components/history/HistoryPanel.tsx` 弹层，双 tab（生成历史 / 回收站），
支持回看 + **套用历史配置**（`selection.ts` 的 `applyHistoryConfig`）。

三个易错点：
- `readHistory(dir, true)` 是「读全部（内部用）」，`readTrash(dir)` 才是「读回收站（对外用）」。
  对外接口用错 → 回收站 tab 会把未删的也显示出来。
- 回收站里的记录**不占** `MAX_HISTORY` 额度。
- 恢复的记录要排到未删列表**最前**，否则未删已满上限时它会在写盘时被截掉
  （表现为「接口返回成功，但列表里没有」）。

## 排查顺序

1. 生成失败 → 先看 `server/index.mjs` 的 `[generate]` 日志，再看 ARK 错误码
2. 图片裂开 → 检查 `/generated` 是否在 vite proxy 里
3. 预览不更新 → 检查 `public/catalog.json` / `faces.json` 是否是最新的
4. 槽位错位 → `npm run verify:geometry`，再看 `scripts/data/` 重新标定
5. 图片显示成空白 → Network 看是否 200；200 但空白 = CSS 塌陷（`<img>` 用百分比高度）

## 别做的事

- 不要把 `.env` 提交或贴进聊天
- 不要在 prompt 里塞型号编号
- 不要手改 `public/faces.json`（下次 `npm run catalog` 会覆盖）
- 不要给前端直连 ARK（Key 会泄露）
