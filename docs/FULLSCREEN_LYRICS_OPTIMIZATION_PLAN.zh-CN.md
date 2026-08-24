# LyricStage 全屏歌词优化方案

状态：Implemented in 0.4.14  
适用基线：`codex/player-metadata-ai@41e8f0b`（0.4.13）  
范围：全屏播放器右侧歌词体验及与常驻 Column 的共享能力  

## 1. 结论

全屏播放器继续采用稳定的 Apple Music 式双栏结构：左侧是封面、歌曲信息和播放控制，右侧是整首歌词。背景环境、模糊封面和克制的光场保留；歌词文字从 Canvas 绘制迁移为可滚动、可点击、可访问的 DOM `LyricScroller`。

本轮不是删除演出，而是明确分层：

```text
稳定背景与环境质感             Canvas / CSS compositor
封面、信息和播放控制           DOM
整首歌词、滚动和点击跳转       DOM LyricScroller
逐字进度与语义强调             DOM 行内效果
宿主播放时间、seek 和 offset   Provider authoritative clock
```

歌词的阅读轴、滚动位置和点击行为不再受 Director、Scene 或背景动画控制。演出只能改变行内字词强调和背景气氛，不能移动整块歌词布局。

## 2. 目标

1. 全屏中可以自然向上、向下浏览整首歌词。
2. 点击任意同步歌词行可以跳转到正确时间，并继续播放。
3. 自动跟随永远服从用户；用户开始浏览后不被下一句强行拉回。
4. 当前句保持在稳定的视觉锚点，不随场景、声部或歌曲结构上下跳动。
5. 快歌、长句、间奏、对唱、seek、暂停和切歌都有明确行为。
6. Column 与 Fullscreen 共用相同的时间、行状态和交互模型，避免双重维护。
7. 保留现有 1:1、16:9 和竖向封面的 `contain` 规则，以及现有背景质感。

## 3. 非目标

- 不重新引入 AI Director。
- 不增加 MotionClip、WAAPI 时间层或第三方动画运行时。
- 不把歌词列表虚拟化；正常歌曲的歌词行数不足以抵消复杂度和可访问性代价。
- 不在第一版增加歌词编辑、翻译来源管理或卡拉 OK 评分。
- 不修改 YouTube Music 对音频、播放状态和权威时钟的所有权。

## 4. 推荐架构

### 4.1 共享组件边界

新增共享组件与纯函数：

```text
apps/stage/src/lyrics/
├─ LyricScroller.tsx
├─ lyricFollowMachine.ts
├─ lyricScrollMotion.ts
├─ lyricRowModel.ts
├─ LyricScroller.css
└─ *.test.ts(x)
```

`LyricScroller` 只接收已经确定的歌词和播放真值：

```ts
interface LyricScrollerProps {
  lyrics: LyricDocumentV1;
  lyricTimeMs: number;
  playbackTimeMs: number;
  lyricsOffsetMs: number;
  durationMs: number;
  playbackState: "playing" | "paused" | "ended";
  reduceMotion: boolean;
  density: "column" | "fullscreen";
  onSeek: (playbackTimeMs: number) => void;
}
```

组件不得接收 `DirectorPlan`、`SceneCard`、layout intent 或环境音频特征。当前行继续由既有 `activeLineIndicesAt(...)` 决定；点击时间继续复用 `playbackTimeForLyricsMs(...)`，包含 offset 和 duration clamp。

### 4.2 Follow 状态机

自动跟随不能只靠“取消当前 rAF”。建立显式状态：

```ts
type LyricFollowMode =
  | "following"  // 播放进度驱动当前句定位
  | "browsing"   // 用户正在查看前后歌词，禁止自动抢回
  | "returning"; // 用户要求回到当前句，完成后进入 following
```

状态转换：

| 事件 | 当前状态 | 下一状态 | 行为 |
| --- | --- | --- | --- |
| wheel、pointer drag、触摸滚动、键盘翻页 | 任意 | browsing | 当帧中断自动滚动 |
| 当前歌词变化 | following | following | 自适应移动到新目标 |
| 当前歌词变化 | browsing | browsing | 只更新高亮，不改变 scrollTop |
| 点击“回到当前歌词” | browsing | returning | 从当前屏幕值移动到当前句 |
| 返回动画完成 | returning | following | 恢复自动跟随 |
| 点击某句歌词 | 任意 | returning | 发送 seek，等待宿主时钟确认后对齐 |
| 切歌 | 任意 | following | 取消旧动画并重置行身份 |

暂停时允许继续浏览。若暂停前处于 `browsing`，恢复播放后仍保持 `browsing`；不得因为播放恢复而夺回滚动位置。

### 4.3 阅读几何

- Fullscreen 当前句锚点固定在歌词 viewport 高度的 `40%`，允许响应式范围 `38%–42%`。
- Column 可继续使用约 `30%` 的紧凑锚点，但由同一组件的 density token 控制。
- 第一行之前和最后一行之后使用真实 spacer，使首尾歌词也能到达同一锚点。
- Fullscreen 水平对齐默认 leading；语言方向使用 `dir="auto"`。对唱不通过整栏左右跳动表达。
- 打开队列时使用覆盖式面板，不重新计算歌词宽度或改变当前句位置。
- 小于约 900px 的 viewport 改为紧凑播放器信息 + 单列歌词，不把两栏硬挤在一起。

### 4.4 滚动运动

保留现有可中断 rAF 方案，不新增动画库，但必须从实时 `scrollTop` 开始，并在任何用户输入发生的同一帧停止。

滚动时间不再固定为 720ms：

```text
下一句间隔 < 800ms       240–320ms
下一句间隔 800–1600ms    320–460ms
普通句                    460–620ms
长句或大距离回位          最多 680ms
reduced motion            立即定位或 120ms 内淡化
```

约束：

- 自动滚动不得晚于下一句开始仍未完成。
- 新目标到来时从当前画面值重新定向，不从旧目标值跳转。
- 不使用 bounce、overshoot 或歌词文字的持续缩放。
- 手动滚动保持浏览器原生惯性；程序只负责自动跟随和“回到当前歌词”。

### 4.5 歌词行表现

每行使用原生 `<button type="button">`：

- `aria-current="true"` 标记当前句。
- `aria-label` 包含歌词正文和跳转时间。
- Enter/Space 跳转，方向键移动焦点，Page Up/Page Down 浏览。
- 点击反馈在 pointer down 即出现，但 seek 在正常 click/touch up 时提交，允许拖离取消。
- 当前句主要依靠颜色、字重和逐字进度强调；行高、字号和几何尺寸保持稳定。
- 移除正常歌词列表上的 `content-visibility:auto` 和按 proximity 的文字缩放。
- 只给接近 viewport 的行设置必要的绘制提示，不为全部歌词长期设置 `will-change`。

视觉层级建议：

```text
当前句       100% opacity / 较高字重 / 逐字进度
相邻句       55–68% opacity
远处歌词     30–42% opacity
已唱歌词     不低于 32%，保证回看可读
浏览状态     降低边缘 mask，所有可见行保持可点击感
```

### 4.6 时间边界

#### 间奏

没有 active line 时不继续把上一句伪装成正在演唱：

- 保持滚动位置；
- 上一句从 active 降为 completed；
- 不提前点亮下一句；
- 可在长间奏中显示极弱的无文本呼吸，但不得新增假歌词行。

#### 对唱与重叠

同一时间活跃的多行组成 `ActiveLyricGroup`：

- 同时高亮，不把最小索引强行当作唯一当前句；
- group 的视觉锚点取整体边界中心；
- 点击任一行仍跳到该行自身经过 offset 换算的起点；
- 第一版不做左右栏分裂，避免破坏阅读轴。

#### 无同步时间轴

纯文本歌词仍可滚动和选择文本，但：

- 不自动跟随；
- 不显示伪造的逐字进度；
- 不提供点击跳转；
- 明确显示“无时间轴”。

#### Seek 与拖动进度条

- scrub 开始后冻结自动跟随；
- 宿主确认新播放时间后只重新定位一次；
- 不以本地乐观时间替代 Provider 时钟；
- 点击歌词的 pending 状态设置短截止，失败时回到 browsing 并显示非阻塞提示。

## 5. Stage 集成

### 5.1 StageCanvas

将 `StageCanvas` 中的右侧歌词区域替换为共享 `LyricScroller`。现有 `canvas` 不再承担整首歌词绘制，可继续作为背景或局部装饰层存在。

第一阶段保留 renderer 中的 `drawReading`，避免影响 Showcase、Performance Lab 和其他消费者；只有 Fullscreen runtime 改走 DOM。待确认没有生产消费者后，再单独评估删除 Canvas reading 路径，不能在同一提交中顺手清理。

### 5.2 ColumnStageView

Column 改为消费同一个 `LyricScroller`：

- 保留 Column 紧凑字号和 30% 锚点；
- 删除本地重复的 rAF、行键盘和点击处理；
- 保留工具菜单、歌词版本和时间轴调整；
- fullscreen 与 Column 使用同一 line key、offset 和 active group 逻辑。

### 5.3 背景与演出边界

允许保留：

- 模糊封面混合背景；
- PerformanceEnvironment；
- compositor 驱动的缓慢 wash/motif；
- 关键词的克制颜色或局部强调。

禁止影响歌词阅读几何：

- Scene 改变歌词 viewport 的位置、宽度或当前句锚点；
- 音频特征驱动整栏亮度、缩放或闪烁；
- 全屏转场遮罩覆盖正在阅读的歌词；
- 封面、队列开合导致歌词栏重新排版跳动；
- 字体重影、整句残影和大范围 glyph scatter。

## 6. 分阶段实施

### Commit 1：纯模型与失败测试

新增纯函数和测试，不接 UI：

- `LyricFollowMode` 状态转换；
- 自适应滚动参数；
- active group；
- instrumental gap；
- seek offset/clamp；
- synced/unsynced capability。

退出条件：短句、长句、间奏、重叠行、seek pending、暂停与切歌测试先失败后通过。

### Commit 2：共享 DOM LyricScroller

- 建立原生 button 行；
- 完整滚动列表；
- following/browsing/returning；
- “回到当前歌词”；
- 键盘与读屏语义；
- reduced-motion。

先在独立 harness 或 Column 中接入，避免同时改全屏布局。

### Commit 3：Column 迁移

- 用共享组件替换 Column 重复实现；
- 保留现有工具和样式密度；
- 删除旧的局部 rAF 与 `div role="button"`；
- 验证滚轮、触摸、点击跳转和 offset。

### Commit 4：Fullscreen 迁移

- 右侧 Canvas lyrics 改为 DOM LyricScroller；
- 固定 40% 阅读轴；
- 保留背景 Canvas/CSS；
- 队列改为不引发歌词 reflow 的 overlay；
- 删除仅用于全屏 Canvas 阅读堆栈的运行调用，但不清理共享 renderer API。

### Commit 5：细节与真实 UAT

- 调整不同语言、长行、逐字 timing 和字体 fallback；
- 复核 1:1、16:9、竖封面与不同 viewport；
- 用录屏逐帧检查换句位置、帧间亮度和字体栅格稳定性；
- 完成真实 Chrome 键盘、鼠标、触控板、seek、暂停、切歌和队列 UAT。

## 7. 验证矩阵

| 场景 | 必须满足 |
| --- | --- |
| 普通 3–5 秒一句 | 当前句稳定到达锚点，无过冲 |
| Rap / <800ms 短句 | 上次动画不延续到下一句 |
| 10秒以上长句 | 不持续漂移，逐字进度稳定 |
| 15秒以上间奏 | 没有伪 active line，不提前点亮 |
| 对唱重叠 | 两句同时活跃且不改变整栏布局 |
| 用户向上滚动 | 后续换句不抢回位置 |
| 点击歌词 | offset 正确、宿主确认后恢复跟随 |
| 拖动进度条 | scrub 期间冻结，确认后只定位一次 |
| 暂停后浏览 | 恢复播放仍保持 browsing |
| 切歌 | 旧动画取消、状态恢复 following |
| 无同步歌词 | 可阅读但无自动跟随与点击跳转 |
| reduced motion | 无大位移、缩放或弹跳 |
| 键盘/读屏 | 可遍历、可激活、当前句语义清晰 |
| 队列开关 | 歌词宽度和当前句位置不跳变 |

## 8. 测试与发布门禁

迭代时只运行相关测试：

- `lyricFollowMachine` / `lyricScrollMotion` 单元测试；
- `LyricScroller` 组件交互测试；
- `lyricsTimeOffset` 回归；
- `embeddedFullscreen` 与 Stage 集成测试；
- renderer 既有测试，确认保留路径未受影响。

发布前按仓库规则运行：

- `npm test`；
- `npm run typecheck`；
- `npm run build:all`；
- Director gateway tests；
- MV3 CSP、release/bundle/module budget 与确定性产物检查；
- 真实 unpacked-extension reload。

固定 unpacked 目录继续实行单一写者。只有源码、聚焦测试和发布门全部通过后才可镜像和 Reload，禁止从旧工作树覆盖。

## 9. 验收标准

满足以下条件才算完成：

1. 用户可以向上浏览至少十行，经过三次歌词换句后仍不会被拉回。
2. 点击任意同步行，实际宿主时间与换算后的目标误差不超过 Provider 正常采样误差。
3. 快歌连续十句中不存在滚动动画累计追赶或反向跳变。
4. 当前句锚点在整首歌中的垂直漂移不超过布局舍入误差。
5. 间奏、对唱、暂停、seek 和切歌行为全部通过矩阵。
6. 读屏器能识别整首歌词、当前句及每行跳转动作。
7. 背景质感仍存在，但录屏中没有全屏亮度闪烁、歌词重影或字体尺寸跳变。
8. Column 与 Fullscreen 对同一 `timeMs`、offset 和歌词合同得到相同 active group。

## 10. 建议顺序

优先完成 Commit 1–4，再做视觉微调。不要先调整字体、模糊和间距来掩盖跟随状态、时间边界和 Canvas 交互能力的问题。最先交付的可感知价值应是：用户终于可以自由浏览歌词、点击跳转，并且界面不会抢走控制权。
