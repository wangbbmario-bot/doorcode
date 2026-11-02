# 响当当 XDD · 铜门定制 App

给客户从画册选配门框/门面花纹/锁/颜色/门头/门柱，用 AI 生成写实预览图。
销售现场用 iPad / Android Pad 大屏演示（移动端横屏优先）。

---

## 快速开始

```bash
npm install
npm run catalog     # 重建素材索引 + 缩略图（改了素材才需要跑）
npm run dev         # 前端 :5173 + 后端 :8787
```

生产：

```bash
npm run build       # 产物到 dist/
npm start           # Node 同时托管 dist/ 与 API，默认 :8787
```

### 环境变量（`.env`，已 gitignore，权限 600）

```
ARK_API_KEY=...                  # 火山方舟 API Key（只在后端读，绝不进前端 bundle）
ARK_MODEL=doubao-seedream-5-0-flash-260915
ARK_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3/images/generations
```

---

## 目录结构

```
doorcode/
├─ public/
│  ├─ assets/{face,head,pillar,lock,emboss,color}/
│  │    ├─ thumb/*.webp   方形裁切缩略图（220px，用于选择网格）
│  │    └─ prev/*.jpg|png 预览图（760px，用于实时合成 + AI 参考）
│  ├─ catalog.json         6 类素材索引
│  └─ faces.json           4 种门面的门扇槽位 + 元素定位框
├─ scripts/
│  ├─ build_catalog.py     扫描材料包 → 缩略图 + catalog.json + faces.json
│  └─ data/                几何源数据（face_spec.json / frames.json）
├─ server/
│  ├─ index.mjs            Express：静态托管 + /api/generate 代理
│  └─ generated/           生成图落盘（ARK 链接 24h 过期，这里永久保存）
└─ src/
   ├─ App.tsx              状态编排（选择 / 槽位 / 生成 / 保存）
   ├─ components/
   │  ├─ PreviewPane.tsx   左：效果展示区 + 上中下槽位热区
   │  └─ SelectorPane.tsx  右：搜索 + 一级 tab + 二级缩略图网格 + 收藏
   └─ lib/
      ├─ compose.ts        Canvas 实时合成 + prompt 生成
      └─ data.ts           素材加载
```

---

## 核心设计

### 分层架构（对应画册「方案 3」）

| 层 | 技术 | 耗时 |
|---|---|---|
| L1 结构层 | Canvas 实时合成预览 | 毫秒级 |
| L2 组件层 | 画册素材直接叠加 | 毫秒级 |
| L3 精修层 | Seedream 5.0 Flash img2img | 15-30 秒 |

### 门面槽位模型

每种门面（2/4/6/8 扇）被划分为 N 个门扇，每扇再分 **上 / 中 / 下** 三个槽位。
坐标全部存在 `public/faces.json`：

- `leaves[]`：门扇的横向边界（画布比例）
- `leaves[].zones`：上/中/下的纵向区间
- `frame`：门框外框
- `headBox / pillarL / pillarR / lockL / lockR`：**相对门框**的比例常数，
  运行时用 `resolveBox()` 换算成画布绝对坐标（见 `src/types.ts`）

> 这些坐标由 `scripts/build_catalog.py` 配套的检测流程产出，
> 已用叠图方式对 4 种门面逐一验证。改门面渲染图后需要重新标定。

### 交互规则（对应飞书画板）

- 点门上的槽位 → 选中（可连续选同一扇的上/中/下，三个同时高亮）
- 再点压花缩略图 → 应用到**所有**已选槽位
- 底图不完全遮住：压花以 72% 透明度叠加
- 一级元素固定顺序：门面 / 压花 / 颜色 / 门头 / 门柱 / 门锁
- 二级元素先展示收藏的（localStorage）
- 「生成效果图」调 Seedream，「保存到相册」下载/系统分享

---

## 第一轮 BUG 修复记录（飞书画板「door 第一轮BUG」）

| # | BUG | 修复 |
|---|---|---|
| 1 | 门柱、门头也要像压花那样有可选框 | 预览区新增门头/左门柱/右门柱/左门锁/右门锁 5 个可选框，点击右侧自动切到对应分类 |
| 2 | 压花长条/方形看不全 | 压花缩略图改为**保持原比例完整显示**（contain），不再裁切；单元放大到 116px |
| 3 | 门头照片看不全 | 门头缩略图改为 **4:1 横条**（原件约 10:1，取中段），纹样文字清晰可读 |
| 4 | 门柱看不全 | 门柱缩略图裁成方形局部 + **大图预览弹层**可看完整原图 |
| 5 | 门锁看不全 | 同上 |
| 6 | 已选压花右上角加 X，叉掉后可重新选择 | 槽位右上角加 × 按钮，取消压花但**保持槽位高亮**，可直接点别的压花替换 |
| 7 | 八扇门的门面框和底图没对齐 | 门扇边界重新标定（`scripts/data/leaf_lines.json` 为唯一真源），并提供 `npm run verify:geometry` 自动校验 |

## 第二轮需求（2026-10-31）

| # | 需求 | 实现 |
|---|---|---|
| 1 | 门柱、门头也需取消选择的小「X」 | 门头/左门柱/右门柱/左门锁/右门锁 选框在**已选中时**右上角出现 × ，点击即取消该部件（门柱左右一起清） |
| 2 | 压花必须**先选门面位置再选压花类型** | 未选位置时压花缩略图**置灰**并在提示条说明；应用后**自动重置待选位置**，避免"选完压花不知道落到哪" |
| 3 | 需要一个地方显示已配置的 门面/压花/颜色/门头/门柱/门锁 | 右栏底部新增**「我的配置」面板**：底部条显示已配置项数，展开后逐条列出名称（压花带「第 N 扇 · 上/中/下」），每条都有 × 可单独取消，底部可一键清空 |

交互约定（画板要求仍然满足）：**可连续选中同一扇门的上/中/下三个位置，一次应用同一个压花**；
应用完成后待选区清零，回到"先选位置"的状态。

另外补了两个自查出来的 bug：
- **选择配置刷新后丢失**：初始化时 `setSel(emptySelection(...))` 覆盖了 localStorage 恢复值 → 改为同一批次里二选一
- **prompt 里残留编号**：`cleanName()` 之前只剥 `XDD-` 和开头数字，`A01`/`B10`/`正宗304` 仍会触发 ARK 输入审核 → 补齐规则

## 第三轮需求：左右轴对称，只配左半（2026-10-31）

门扇数（2/4/6/8）都是偶数，中轴落在第 N/2 扇与第 N/2+1 扇之间，因此**门天然左右轴对称**。
改成**只需给左半的门选压花**，右半自动镜像：

| 门面 | 可配置左半 | 提示条 |
|---|---|---|
| 两扇门 | 第 1 扇 | 配左半 1 扇 |
| 四扇门 | 第 1-2 扇 | 配左半 2 扇 |
| 六扇门 | 第 1-3 扇 | 配左半 3 扇 |
| 八扇门 | 第 1-4 扇 | 配左半 4 扇 |

实现要点（`src/lib/selection.ts`）：
- `leftHalfCount(face)` / `isLeftHalf(face, leaf)` / `mirrorLeaf(face, leaf)` —— 对称模型
- **选区框只渲染左半**，右半没有可点框（避免误操作）
- **存储只存左半**：`sel.emboss` 的 key 全是左半门扇号
- **合成时镜像**：`effectiveEmboss()` 让右半取左半镜像的压花 → 预览即时呈现对称效果
- **提示词只描述左半**：明确告诉模型「右半请做成完全对称的镜像」
- **配置面板只列左半**，顶部显示「左右对称 · 配左半 N 扇」
- 切换门面 / 恢复历史配置时用 `pruneRightHalf()` 清掉早期版本存的右半数据

## 门面上/中/下 纵向划分

每扇门面的纵向占比固定为 **上 10% / 中 80% / 下 10%**：

```
doorTop   ┌──────────────────┐
          │  上  10%         │  ← 窄条（装饰边框）
          ├──────────────────┤
          │                  │
          │  中  80%         │  ← 主纹样区（浮雕主体）
          │                  │
          ├──────────────────┤
          │  下  10%         │  ← 窄条
doorBottom└──────────────────┘
```

比例写在 `scripts/build_catalog.py` 的 `zones` 里，改门面图时一起调整。

## 「已配置项」浮动清单

位置：**效果展示区（左侧）门面图的左上角**，半透明背景（`rgba(24,18,14,.55)`），能透出底下的门面。

- 标题栏显示「已配置项 N」+ 清空按钮 + 折叠箭头（点标题收起/展开）
- 逐条列出 门面 / 门头 / 门柱 / 门锁 / 颜色 / 压花（压花带「第 N 扇 · 上/中/下」）
- 每条右侧 × 可单独取消
- 门面图改为**顶部对齐**，浮层正好压在门面左上角
- 宽度 `min(252px, 48%)`，窄屏自动收窄

## 生成历史

每次点「生成效果图」都会在 `server/generated/index.json` 写一条记录（含**配置快照**），
预览区左下角有「生成历史」按钮：

- 弹层里按时间倒序列出所有生成过的效果图（缩略图网格）
- 点某张 -> 大图详情 + 配置摘要（门面/门头/门柱/门锁/颜色/压花几处）
- **「套用这组配置」** -> 把当时的配置整套恢复回来
  （客户说"就按刚才那版改个颜色"时直接用）
- 「下载原图」下载 ARK 生成的高清图（服务器已落地，24h 链接过期也不影响）

后端 API：
- `GET /api/history` -> `{ ok, items: [...] }`
- `DELETE /api/history/:id` -> 删除记录并删文件

历史存储逻辑抽在 `server/history.mjs`（纯文件操作，可单测）。

## 已知坑（踩过的，别再踩）

### 1. ARK Seedream 的 img2img 输入可以用 base64 data URI

不需要公网图床。`image` 字段接受：

```
data:image/<格式>;base64,<base64>
```

格式字母要小写。单图 ≤30MB，最多 10 张参考图（Flash 上限）。

这解决了「内网 OSS bucket 跨区域不通 → ARK 拿不到图片 → 403」的死局。
`mcode-tools upload_temp_url` 返回的是 `matrix-internal-cn.oss-cn-shanghai.aliyuncs.com`，
**外部区域访问不了**，别指望它。

### 2. ARK 输入审核会误杀产品型号编号

```
InputTextSensitiveContentDetected: The request failed because the input text may contain sensitive information.
```

触发的是 **prompt 里的型号编号**（`XDD-1801`、`1816` 这种字母数字组合），
不是图片。去掉编号后同样的 prompt 立刻通过。

处理方式（两层保险）：
- 前端 `cleanName()` 剥掉编号，prompt 里改用 `Image N` 引用素材
- 后端 `server/index.mjs` 检测到该错误码时，自动剥编号重试一次

### 3. Flash 不支持的参数

`stream`、`sequential_image_generation` 传了直接 400。

### 4. CSS 尺寸陷阱

`aspect-ratio` + `max-width:100%` + `max-height:100%` 同时写会被 max-width 截断，
比例失真。预览区改成 JS 用 `ResizeObserver` 精确算像素宽高。

### 5. Vite dev 的 SPA fallback

`/generated/xxx.jpg` 不在 vite proxy 里会被 fallback 成 index.html，
图片裂开。dev 代理要同时配 `/api` 和 `/generated`。

### 6. 上千张缩略图不能一次性挂载

最初压花网格有「显示全部 1324 项」按钮，点下去一次性挂载 1324 个 `<img>`：
请求全排队、浏览器解码不过来，**整屏变成横线阵列，看起来像「图没加载出来」**。

改成**虚拟滚动**（只渲染视口内的行 + 3 行 overscan）：
DOM 节点始终 < 50，任意时刻只有几十个图片请求，滚动到底也流畅。

`src/components/SelectorPane.tsx` 的实现要点：
- 行高/列宽用 `ResizeObserver` 测 `.pane-right` 算出来
- cell 用 `position:absolute` + `translate()` 定位到虚拟坐标
- 容器高度 = `totalRows * rowH`，滚动条长度真实反映总量

### 7. `<img>` 在 `<button>` / 百分比高度上下文里会塌陷成 0

Chrome 的 `<button>` 内部是 flex 容器，`<img>` 用 `height:100%` 会和 button 高度
形成循环依赖 → 图片高度 0，整格看起来是空白（**图片其实是 200 加载成功的**）。

**排查陷阱**：Network 里图片全 200、canvas 像素探针也正常，但视觉上就是白的 →
说明问题在 CSS 渲染层，不是数据层。

修法：给容器 `position: relative`，图片改 `position: absolute; inset: 0`。

### 8. flex 容器里 overflow≠visible 的子项不会被 stretch

`.grid-scroll` 是 column flex 的子项且 `overflow-y:auto`，
`align-items: stretch` 对它**不生效**，宽度会塌成 min-content（内容宽度）。
必须显式写 `width: 100%`，否则虚拟滚动的列数算错、网格挤成一条。

同类问题：flex item 缺 `min-width: 0` / `min-height: 0` 会被内容撑破。

---

## 待办 / 后续

- [ ] 门面渲染图更新后重跑槽位标定
- [ ] 报价单导出（PDF）
- [ ] 按画板设想打包 Android APK（Capacitor / WebView）
