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
npm test           # 163 个用例
npm run verify     # 一键验收：类型 → 测试 → 几何标定 → 构建 → 安全检查
```

`npm run verify`（`scripts/verify.sh`）是**提交前的唯一闸门**：
任一步失败即 `exit 1`，失败项会一次性全部列出。

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
│  ├─ history.ts         生成历史 API 封装（列表 / 软删 / 恢复 / 彻底删）
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
| `scripts/verify.sh` | **提交前闸门**：类型→测试→几何→构建→安全检查 | 改验收标准 |

## 组件化约定（防止改一处崩一片）

1. **状态只走 reducer**：组件**不许**直接 `setState` 改共享状态，
   一律 `dispatch(actions.xxx(...))`。新增交互 = 在 reducer 加一个 case + 加一个 action creator。
2. **业务规则进 `lib/`**：`lib/` 里的函数必须是纯函数、可单测。
   组件里**不允许**出现"如果…就…"的业务分支，只做渲染。
3. **组件自治**：局部 UI 状态（如大图弹层开合）留在组件内部，不上抛。
4. **派生数据在 Provider 算好**：组件不自己算 `configEntries` / `favNames` 这类派生值。
5. **一个组件一个目录**：超过 ~120 行就拆子组件，子组件放在同目录。
6. **改完必须跑 `npm run verify`**：reducer 的每个 case 都有用例覆盖，
   改 reducer 不会影响别的模块。`verify` = 类型 + 测试 + 几何标定 + 构建 + 安全检查。
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

**上/下是对称的**（门的上下造型对称，压花自然也对称），
所以点「上」或点「下」都是**同时选中这两处**，只需选一次压花；中部独立。
实现落在 `lib/selection.ts`：
- `toggleSlot` —— 点上/下时上下一起选/一起取消（以被点的那个槽位当前状态为准）
- `clearEmboss` —— 清上/下时上下一起清
- `buildConfigEntries` —— 配置清单把上下合并成一条「第 N 扇 · 上/下」
- `compose/prompt.ts` —— 提示词里上下合并成一条「第 N 扇门的上、下区域（上下对称，用同一款纹样）」

存储格式不变（仍是 `leaf:zone` 两个 key），所以镜像、合成、历史快照都不用改。

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

## 已踩过的坑（别再踩）

这些是本项目**真实踩过并已修复**的，改代码前先扫一眼。

### A. CSS / 布局类

1. **replaced element 用百分比高度会塌成 0**（图片"加载成功但显示空白"）
   Chrome 的 `<button>` 内部是 flex 容器，`<img>` 用 `height:100%` 会和容器高度形成
   循环依赖 → 高度解析为 0。**修法**：容器 `position:relative` + 图片 `position:absolute; inset:0`。
   见 `.cell-img img`。
2. **flex item 不加 `min-width:0` / `min-height:0` 会被内容撑破**
   本项目所有 `flex: 1 1 auto` 的容器都要成对写 `min-height:0`（纵向可滚）
   和 `min-width:0`（横向不撑破）。已体检：`.stage-area` / `.stage-wrap` / `.zoom-img` /
   `.config-float-body` / `.history-grid` / `.history-detail-img` / `.ci-value`。
3. **`overflow != visible` 的子项不会被 `align-items:stretch` 拉伸**，宽度会塌成 min-content。
   虚拟滚动容器必须显式 `width:100%` + `min-width:0`（见 `.grid-scroll`）。
4. **truncate（省略号）的父级必须是 flex item 且有 `min-width:0`**，
   否则长文本把兄弟元素（关闭按钮、徽章）挤出可视区。见 `.zoom-title` / `.history-msg`。
5. **绝对定位的热区叠放靠 DOM 顺序，不设 z-index 就会被后渲染的整块盖死**：
   压花槽位热区（`.zone`）渲染在部件选框（`.zone.part`）之后 → 门锁选框在中轴上，
   必然被中央门扇的「中」区 100% 覆盖，**门锁永远点不到**（4 种门型全中）。
   修法：压花热区 `z-index:1`、部件选框 `z-index:3`、取消 × `z-index:4`。
   判据：**两个热区在几何上可能重叠时，必须显式给层级**，别指望 DOM 顺序。
6. **窄容器里 flex 子项会被压成竖排一个字一行**：标题、品牌、chip 都加
   `white-space:nowrap` + `flex:0 0 auto`；要能截断的（`.sym-note` / `.ci-detail`）
   用 `flex:0 1 auto` + `min-width:0` + 省略号，否则会把浮层撑出横向滚动条。
7. **`<button>` 的 UA 默认边框是 `2px outset buttonborder`**，
   深色背景上 `outset` 的上边会渲染成一条**亮白线**。
   只写 `border-bottom` 没用 —— 长手属性只覆盖下边，上/左/右仍是默认的 `outset`。
   修法：`border: 0` 显式重置（已加全局兜底 `button { border: 0 }`）。
   排查：直接量像素 —— 顶边若亮度 >150 而其余边很暗，就是它。
8. **虚拟滚动的行高必须按每行实际内容算**：固定行高（按最扁的素材算）
   会让矮素材那一行下方整块留白，表现为「空了一行」。
   修法：行高 = 该行最高格子，行 top 用**前缀和**定位
   （`computeWindow` 改成接收 `rowTops` 前缀和 + `findRow` 二分）。
   配套：异形素材（压花比例差 30 倍）要**按比例排序**，
   否则同一行高的矮的混排、行内仍留白 —— 压花按 `|log(比例)|` 升序，
   近方形的排最前（也最好用）。
9. **素材自带的白边会体现在缩略图上**：15.5% 的压花是带白边的电商产品图，
   不裁白边就会有一条白带。修法：构建时裁掉白边（`trim_white` + `strip_light_border`）。
   坑点：白边常是**白→灰的渐变**（255 渐变到 234），
   按「浅色像素占比」判定会卡在渐变中间一行导致整条切不掉 → 用**行平均亮度**判定。
   再加保护：行内深色像素超 15% 就停止切，避免误切拉手高光/浮雕边缘。
   验证判据：剥离后**深色内容损失率必须为 0**（实测 1375 项全部 0.00%）。
   但**预览图（prev）必须用原图** —— 它要贴到门上/喂给 AI，比例不能变。
10. **素材重建后必须让资源 URL 变化**：内容变了但文件名没变 ->
   浏览器继续用缓存里的旧图（用户会看到「改了还是有白边」）。
   修法：catalog 里的 thumb/prev 带 `?v=<内容 hash>`，版本号按分类算
   （素材不变则 URL 不变、不会重复下载；素材变了则 URL 必变）。
   注意：查素材文件是否存在时要**去掉 query** 再拼路径，否则测试全挂。
11. **异形素材要按尺寸分档，不能连续渐变排**：压花 1324 项宽高比差 30 倍，
   连续排会让每行大小都不同，看上去「排列很乱」。
   修法：按**显示尺寸**分档（格子高度封顶 2.5 倍格宽，所以要分两段：
   满宽的按显示高度分档、满高的细条按宽度分档），
   档内单调、项数太少的档自动并入前一档（`sort_emboss`）。
   档号写进 catalog 的 `sizeBucket`，前端在档首格加铜色分隔线 + 底部显示「第 N/M 类」。
12. **收藏项不能直接抽到列表最前**：那会让「收藏的小方块」和「长条」挤在同一行，
   行内就不是同一种类型了。修法：收藏项排**它自己那一档的最前**，
   段之间保持原顺序（有了二级分类后，用户直接切到对应尺寸档去找）。
   行内要**以行首项的档为准**（不是跟前一格比）——跳过的那格不占位，
   跟前一格比会让下一档的项挤进还含旧档的那一行。
   验证判据：遍历整页，**同一行的 sizeBucket 必须唯一**。
13. **压花要有二级分类（按尺寸档）**：1324 项全堆在一列没法挑。
   构建期算出每档的显示宽高（`bucket_display_size`）并起名（`bucket_name`），
   写进 catalog 的 `buckets: [{id, name, count}]`；前端渲染二级 tab
   （全部 / 收藏 / 各尺寸档），切换只过滤 `sizeBucket`。
   档名要用**中位数**判定（用 max/min 会把「窄条」误判成「满宽」，导致两个档重名）。

### B. React 状态类

5. **初始化默认值会覆盖 localStorage 恢复值**
   `Promise.then(() => setSel(default))` 和恢复逻辑分处两个 effect → 竞态，刷新后配置必丢。
   **修法**：恢复与默认值必须在**同一个决策点**二选一。
6. **派生值必须 `useMemo` 稳定引用**，否则每次渲染都是新数组 → 下游 effect 无限触发。
7. **语义相近的函数不要互相复用**：`clearAllConfig` 复用 `switchFace`（只清压花），
   导致"清空所有"实际没清门头/门柱/门锁/颜色。两者含义不同就各写各的。

### C. 数据 / 流程类

8. **脚本不要依赖 `/tmp`**：系统清 `/tmp` 后标定脚本直接失效（报错"需重新标定"，
   但其实是文件没了）。材料已解压到项目内 `.materials/`（gitignore）。
9. **prompt 里绝不能出现型号编号**：`XDD-1801` / `1816` / `A01` / `正宗304`
   都会被 ARK 输入审核 400 误杀。用 `Image N` 引用，编号清洗在 `compose/prompt.ts`。
10. **参考图上限是 10 张（含合成底图）**：前端 `collectRefs` 去重后按优先级截到 9，
    后端再兜底截到 10。两边都要有，否则请求会被 ARK 拒。
11. **左半存储 + 右半镜像**：切换门面 / 恢复历史配置时必须 `pruneRightHalf()`，
    否则旧数据会让右半出现"幽灵压花"。
12. **软删不等于删除**：生成图是客户资产，硬删不可逆 → 默认软删进回收站，
    只有 `purge` 才真删文件。
13. **成功提示和错误提示都要自动消失**：`HistoryPanel` 里成功分支有
    `setTimeout(() => setMsg(null), 2200)`，错误分支漏了 → 报错后红字一直挂在屏幕上。
    统一走一个 `flash(text)` helper，两条分支都调它。

### D. 排查口诀

- 图片裂开 → Network 看状态码；200 但空白 = CSS 塌陷（见坑 1）
- 预览不更新 → `public/catalog.json` / `faces.json` 是不是最新的
- 槽位错位 → `npm run verify:geometry`
- "两个视图不一致" → **别猜哪边坏了**，把两边量化成同一量纲对比，数字会指认真凶
- 配置刷新后丢 → 坑 5
- 两个视图实时性割裂 → 同一份状态被两个视图分别读取时，一个读实时源、一个读滞后源

## 排查顺序

1. 生成失败 → 先看 `server/index.mjs` 的 `[generate]` 日志，再看 ARK 错误码
2. 图片裂开 → 检查 `/generated` 是否在 vite proxy 里
3. 预览不更新 → 检查 `public/catalog.json` / `faces.json` 是否是最新的
4. 槽位错位 → `npm run verify:geometry`，再看 `scripts/data/` 重新标定
5. 图片显示成空白 → Network 看是否 200；200 但空白 = CSS 塌陷（`<img>` 用百分比高度）
6. 提交前 → `npm run verify`

## 别做的事

- 不要把 `.env` 提交或贴进聊天
- 不要在 prompt 里塞型号编号
- 不要手改 `public/faces.json`（下次 `npm run catalog` 会覆盖）
- 不要给前端直连 ARK（Key 会泄露）
- 不要跳过 `npm run verify` 直接提交
- 不要用 `rm` 硬删 `server/generated/` 里的图（客户资产，走回收站的 `purge`）
- 不要把脚本的输入路径写死到 `/tmp`
