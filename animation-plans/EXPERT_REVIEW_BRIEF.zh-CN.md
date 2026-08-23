# LyricStage Director V2 专家评审说明

- **文档目的**：邀请资深动画导演、创意技术总监、实时图形工程师或音乐可视化研究者，对 LyricStage 下一代 AI 演出系统进行独立评审。
- **目标基线**：`origin/main@82a5e21`
- **当前产品版本**：0.3.1
- **评审状态**：设计阶段，尚未实施 Director V2
- **希望得到的结果**：指出设计中合理、过度、遗漏或错误的部分，并给出优先级明确的修订建议。

---

## 一、执行摘要

LyricStage 是运行在 YouTube Music 上的实时歌词演出扩展。它不接管播放器，不下载歌曲，也不生成一条预渲染视频；它读取当前歌曲、歌词和权威播放时间，在 Column 或 Fullscreen 中实时绘制歌词、封面、环境和动画。

项目已经解决了大量工程问题：歌词匹配、逐行/逐词时间、暂停与 seek、多标签页、换歌、缓存、BYOK AI、隐私、AI 失败回退、WebGL/Canvas2D 降级和真实 Chrome 生命周期。

当前主要问题不是“系统坏了”，而是“AI 导演看起来没有充分导演”：

- 一个约 45–75 秒的窗口通常只有一张 AI Scene Card。
- 普通场景只有 0–2 个歌词 gesture、0–1 个 effect。
- 整首歌通常只有 2–4 个 signature moment。
- AI 决定整曲 Bible、世界、场景和少量重点动作，但大部分逐句 motion 仍由本地规则循环生成。
- 背景持续运动，却主要按固定时间函数循环，并没有稳定地贴着当前音乐能量、瞬态和静音变化。
- 所有布局变化使用近似相同的短淡入，戏剧原因没有通过空间动作表达。

我们希望把系统升级为：

> AI 负责整曲叙事、场景推进和重要歌词的语义意图；人工制作一套高质量、可复用、可寻址的编舞片段；本地 Performance Compiler 把意图编译成安全动作；Pixi/Canvas/WAAPI 按权威歌曲时间执行；所有失败仍回到完整本地演出。

本方案明确不希望：

- 让模型生成 JavaScript、CSS、SVG、shader、坐标或关键帧。
- 每句歌词生成一个完全无关的新世界。
- 把“更多特效”误当作“更好的导演”。
- 自研完整动画编辑器、beat tracker 或插件生态后才看到第一轮艺术效果。
- 用硬 Schema 强迫所有歌曲具有相同场景数量和密度。

---

## 二、产品与使用场景

### 2.1 用户体验

用户在 YouTube Music 正常播放歌曲，打开 LyricStage：

1. YouTube Music 保留播放、账号、播放队列和权威时钟所有权。
2. LyricStage 获取有限的曲目信息、封面、播放状态和时间。
3. 歌词系统寻找匹配的同步歌词，必要时允许手动选择和时间校准。
4. 本地 Director 立即生成一个完整、确定性的演出，保证无 AI 配置也能使用。
5. 如果用户配置 BYOK，AI Director 在后台生成整曲 Bible 和滚动场景。
6. 经过验证的 AI 场景逐步接管未来时间段；AI 失败不会中断演出。
7. Fullscreen Stage 按权威时间逐帧绘制，seek 后必须直接得到对应时间的正确状态。

### 2.2 与传统歌词视频的区别

LyricStage 不是 After Effects、Remotion 或离线视频渲染器：

- 不能假设歌曲一定从头播放。
- 用户可能在任何时刻暂停、快进、回退或换歌。
- AI 卡可能在歌曲播放过程中晚到。
- Chrome 扩展可能重载，Stage 必须从缓存和当前时间恢复。
- 每个画面必须能够由 `timeMs` 确定性重建。
- 网络和 AI 不能位于动画帧循环或播放关键路径。

因此，普通“播放一次动画时间线”的设计并不完全适用。

---

## 三、当前系统架构

### 3.1 数据流

```text
YouTube Music Provider
  ├─ track identity / artwork / duration
  ├─ authoritative clock / pause / seek / rate
  └─ synchronized lyrics
          ↓
Local Director ────────────────┐
          ↓                    │ complete fallback
DirectorPlanV1                 │
          ↑                    │
Rolling AI Director            │
  ├─ DirectorBibleV1           │
  ├─ SceneCardV1               │
  └─ RollingPerformanceStateV1 │
          ↓                    │
validated compile/merge ───────┘
          ↓
Renderer
  ├─ Canvas lyric renderer
  ├─ Pixi/Canvas environment
  ├─ DOM artwork/info composition
  └─ reduced-motion branches
```

### 3.2 当前可用的动作系统

当前源码已经具备：

- 9 种逐句 behavior：`settle`、`assemble`、`gravityDrop`、`ripple`、`stretch`、`echo`、`drift`、`focus`、`converge`。
- 12 种歌词 gesture，覆盖 glyph、token、phrase。
- 20 种 effect primitive，覆盖 environment、structure、lyric support、cover 和 transition。
- 17 个 Effect Card 配方。
- 5 种布局。
- 6 种 art direction。
- 5 种 typography。
- 9 种 motif actor family。
- `DramaticScoreV1`：act、motif、signature、quiet window、recall。
- `MotionClipV1`：opacity、translate、scale、rotation、blur、tracking、mask 等轨道。
- Theatre.js Performance Lab，用于开发环境动画调试和状态导出。
- PixiJS WebGL 环境以及 Canvas2D fallback。

### 3.3 当前保守性的直接来源

#### 单窗口只有一个场景

`packages/performance/src/rollingDirectorPrompt.ts` 当前将 `scenes.maxItems` 固定为 1，并明确要求不能把窗口拆分。

#### AI 没有控制普通逐句动作

`packages/performance/src/rollingDirector.ts` 在合成 Rolling Plan 时仍使用：

```ts
directives: local.directives as DirectorLineDirectiveV1[]
```

本地 ordinary line 主要按照重复、重叠和行号循环选择动作。这保证稳定，但语义差异有限。

#### 招牌事件数量与场景预算较低

- Bible：2–4 个 signature anchor。
- 普通 Scene：0–2 gesture、0–1 effect。
- Signature Scene：2–4 gesture、1–2 effect。
- Whole song：最多 2 次布局变化。
- Prompt：至少 40% quiet lyric time。

#### 环境运动主要是时间循环

环境粒子、orb、rail 和 CSS world motif 大量使用 `sin(time)` 或固定周期 CSS keyframes。MusicMap 会影响 section intensity，但当前没有一个稳定、低延迟的实时反应总线直接驱动视觉参数。

#### 所有空间变化使用相似的视觉解释

布局变化目前主要触发一个 200ms、7px 位移、轻微缩放的统一 arrival。`voiceReframe`、`silenceOpen`、`finalExpansion` 的数据语义不同，但观众看到的空间动作区别不够明显。

---

## 四、外部项目参考

### 4.1 Visual Lyrics

项目与论文：<https://visual-lyrics.github.io/>

值得吸收：

- 先分析歌词和音乐，再标注哪些词适合图像、动画或视觉强调。
- 每句歌词有明显动画产出。
- 用户可以编辑标注、调整创意方向、重生成或修改中间指令。
- 建立了 306 个代码动画案例数据集作为创作参考。

不应照搬：

- 逐句独立生成可能造成场景之间缺乏平滑转场和整曲叙事。
- 图像生成和任意代码生成不适合实时扩展的安全、延迟和确定性边界。

### 4.2 TextAlive

开发者平台：<https://developer.textalive.jp/>

值得吸收：

- phrase → word → character 的层级时间模型。
- 每一级都有 start/end/progress，可用于可寻址动画。
- beat、chorus 等音乐结构可以与歌词时间一起驱动表现。
- 提供可复用歌词应用和模板生态。

不应直接依赖：

- TextAlive 是内容与开发平台，不是可直接嵌入 YouTube Music 的自动导演。
- LyricStage 必须继续尊重自己 Provider 的时间和媒体所有权。

### 4.3 Butterchurn / MilkDrop 类型视觉器

项目：<https://github.com/jberg/butterchurn>

值得吸收：

- 连续逐帧音频响应。
- 参数映射和预设作者生态。
- 即使宏观视觉不变化，画面仍持续与音乐呼吸。

不应照搬：

- 随机 preset 轮换会破坏歌词阅读和叙事母题。
- 全屏高密度 shader 视觉不能压过歌词主信息。

### 4.4 Theatre.js

文档：<https://www.theatrejs.com/docs/latest/manual/projects>

项目已经依赖 `@theatre/core` 和 `@theatre/studio`。Theatre.js 可编辑动画属性、组织 sequence、保存并导出 JSON 状态。推荐把它作为内部编舞制作工具，不把 Studio 直接塞进生产扩展。

### 4.5 Web Animations API 与 PixiJS

- WAAPI `Animation.currentTime`：<https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime>
- PixiJS Application：<https://pixijs.com/8.x/guides/components/application>

WAAPI 可以在运行或暂停时直接设置动画毫秒位置，适合让 DOM artwork/info 转场跟随权威歌曲时间。PixiJS 已经承担 WebGL 环境渲染，可继续负责 motif、粒子和场景层，不需要再引入另一套实时图形引擎。

---

## 五、设计目标与非目标

### 5.1 设计目标

1. **AI authorship 可见**：观众应能从普通歌词行的运动和场景推进感受到 AI 对歌曲语义的理解，而不是只看到一个 AI 徽标。
2. **整曲有一个可以复述的视觉母题**：开头出现，中段变化或破裂，最终回归或解决。
3. **音乐与画面持续连接**：不依赖 AI 逐帧生成，使用本地音频特征驱动环境和局部动作。
4. **强弱有层级**：普通行、视觉场景、dramatic beat、Hero event 不同级别，不能所有时间都高潮。
5. **可读性优先**：歌词 master 始终清楚；装饰层不能替代或遮盖歌词。
6. **可寻址、可暂停、可 seek、可 replay**：同一 `timeMs` 得到同一状态。
7. **失败不降级产品可用性**：任何 AI、网络、音频捕获或 WebGL 失败都有完整回退。

### 5.2 非目标

- V2 不做完整视频导出。
- V2 不实现 Bilibili Provider。
- V2 不开放用户运行任意插件或脚本。
- V2 不自动生成远程图片、3D 模型或 shader。
- V2 不追求每个字都有独立动画。
- V2 不保证所有歌曲达到相同的视觉密度。

---

## 六、推荐的 Director V2 架构

### 6.1 总体数据流

```text
Track + Lyrics + MusicMap
          ↓
DirectorBibleV2
  - premise / acts / motif arc
  - density profile
  - primary visual identity
  - signature anchors
  - reactive mapping preferences
          ↓
rolling ScenePackV2
  - 3–5 SceneBeatV2 per request
  - sparse SemanticCueV1
  - signature clip selection
  - scene continuity
          ↓
Performance Compiler
  - validates exact timing/text/state
  - fills ordinary lines locally
  - maps semantic cues to existing directives/gestures/clips
  - adds audio-reactive mappings
          ↓
DirectorPlanV1 or a backwards-compatible V2 renderer plan
          ↓
Runtime
  - Canvas lyric renderer
  - Pixi environment/motif
  - WAAPI DOM composition
  - authoritative time sampling
```

### 6.2 为什么使用稀疏 Semantic Cue，而不是逐行完整 AI 动画对象

最初设计考虑让 AI 为每一行返回 `entrance + hold + exit + focus + motifRelationship`。专业复审后认为，这会产生：

- 更大的输出和更高的响应延迟。
- 更高的 JSON Schema 拒绝率。
- 重复描述普通行，浪费模型 token。
- 新建第二套动画 DSL，与现有 MotionClip、Directive、Gesture 重叠。
- AI 对每行过度导演，降低整体对比。

因此推荐：

```ts
export interface SemanticCueV1 {
  version: "semantic-cue-v1";
  lineIndex: number;
  dramaticRole:
    | "question"
    | "answer"
    | "confession"
    | "refrain"
    | "approach"
    | "rupture"
    | "release"
    | "resolution";
  motifRelationship:
    | "introduce"
    | "approach"
    | "cross"
    | "echo"
    | "break"
    | "multiply"
    | "withdraw"
    | "resolve";
  intensity: number;
  focus?: {
    fromGrapheme: number;
    toGrapheme: number;
    expectedText: string;
    semanticRole: string;
  };
}
```

Scene 可以只标注真正有意义的行。没有 cue 的行继续由本地导演生成可靠动作；Performance Compiler 可以根据相邻 cue、act tension 和 scene intention 对普通行做插值，而不是让模型重复填写。

### 6.3 ScenePackV2

```ts
export interface ScenePackV2 {
  version: "scene-pack-v2";
  bibleIdentity: string;
  entryStateHash: string;
  scenes: SceneBeatV2[];
}

export interface SceneBeatV2 {
  fromLineIndex: number;
  toLineIndex: number;
  intention: string;
  preserves: string[];
  changes: string[];
  leavesBehind: string[];
  layout: PerformanceLayoutV1;
  presentation: StagePresentationV1;
  semanticCues: SemanticCueV1[];
  effectSelections: string[];
  signatureClipID?: string;
  evidence: DramaticEvidenceV1;
}
```

建议软目标：

- 请求窗口：45–60 秒。
- 每窗口：通常 3–5 个 Scene Beat。
- 普通场景：通常 8–20 秒，2–6 句。
- 边界优先对齐：section、silence、energy change、voice handoff、repeated hook。
- 四分钟平衡模式：通常 16–20 个 Scene Beat。

建议硬约束只负责：

- 场景连续、无重叠、无空洞。
- 只使用真实歌词行边界。
- 时间、身份和 entry state 正确。
- effect/gesture/clip 全部来自注册表。
- 不越过全曲成本、并发和布局安全预算。

不建议因为模型只返回 2 个而不是 3 个场景就拒绝整个包，只要覆盖、连续性和质量合法。数量不足应进入审片 warning 或触发本地合理拆分，而不是当作安全错误。

### 6.4 Performance Compiler

Compiler 是 V2 的核心，而不是新的动画引擎。

职责：

1. 验证 AI 意图是否引用真实歌词、行号、word timing 和已注册动作。
2. 将 Semantic Cue 映射到已有 `DirectorLineDirectiveV1`。
3. 为 exact focus 生成 `LyricGestureV1`。
4. 为场景选择已有 `EffectRecipeV1`。
5. 为 signature 选择人工制作的 `MotionClipV1` 组合。
6. 为没有 cue 的行保留完整本地动作。
7. 保持 elapsed scene 的 id、timing 和内容不变。
8. 输出当前 renderer 可以确定性消费的 plan。

Compiler 可使用规则示例：

| Dramatic role | 默认动作候选 | 限制 |
|---|---|---|
| question | suspend、focus、phrase contour | 不做强 release |
| answer | converge、settle、underline | 与 question 方向呼应 |
| refrain | echo、expand、memory trail | 每次重复必须有升级或回收 |
| approach | drift、converge、rail movement | 保持可读速度 |
| rupture | offset snap、cut、break/reform | 需要结构证据 |
| release | breathe、expand、density release | 避免同时再做 hard cut |
| resolution | settle、motif recall、final dissolve | 必须回收已有视觉承诺 |

---

## 七、动作制作与运行时复用策略

### 7.1 Theatre.js 负责人工编舞

推荐流程：

```text
设计师/动画导演在 Theatre.js Studio 制作动作
        ↓
导出项目 JSON
        ↓
构建脚本转换为 MotionClipV1/Clip bundle
        ↓
静态校验、测试和打包
        ↓
生产扩展只加载轻量运行数据，不加载 Studio
```

这样可以避免自研：

- 关键帧编辑器。
- 属性面板。
- 时间线缩放和轨道管理。
- easing 可视化。
- 动画 JSON 编辑器。

### 7.2 MotionClipV1 继续作为基础轨道格式

现有 MotionClip 已支持：

- opacity
- translateX/Y
- scale
- rotation
- blur
- tracking
- maskProgress
- linear、easeOutCubic、easeInOutCubic、hold

如果签名场面确实需要新属性，应先证明现有属性不能表达，再对 MotionClip 做小幅版本化扩展。不要建立平行的 `LineAnimationDSL`。

### 7.3 PixiJS 负责环境和 motif

适合放在 Pixi 中的内容：

- particles、rails、orbs。
- motif actor。
- memory trace。
- background geometry。
- reactive environment。

不建议为 V2 新增另一个 WebGL 引擎。

### 7.4 WAAPI 负责 DOM artwork/info 转场

封面、标题和布局信息仍是 DOM。为保持 seek 确定性：

1. 创建 paused WAAPI Animation。
2. 不调用正常 wall-clock play。
3. 每帧以权威歌曲时间计算 transition local time。
4. 设置 `animation.currentTime`。
5. seek 直接跳到正确进度。
6. reduced motion 替换为 opacity-only effect。

Canvas 和 WAAPI 必须采样同一个 transition record 和 `timeMs`。

---

## 八、实时音频响应设计

### 8.1 V1 Reactive Bus 字段

```ts
export interface ReactiveFrameV1 {
  trackID: string;
  captureID: string;
  mediaTimeMs: number;
  energy: number;
  bass: number;
  brightness: number;
  onset: number;
  stereoWidth: number;
  silence: number;
}
```

暂不建议包含 `beatPhase`。原因：捕获可能从歌曲中间开始，tempo 估计会漂移，自由节奏和切分节奏需要远比当前计划复杂的 beat tracking。

### 8.2 数据边界

- 分析继续在 offscreen audio document 内完成。
- 原始 PCM 和 FFT bins 不离开 offscreen，也不持久化。
- 最多 15Hz 向 Stage 转发平滑后的少量字段。
- latest frame wins，不保存历史。
- track/capture/generation 不匹配立即丢弃。
- 500ms 无新帧后衰减到 neutral。
- 捕获不可用时使用完整的 deterministic time-loop fallback。

### 8.3 建议映射

| 音频特征 | 推荐视觉目标 | 不推荐 |
|---|---|---|
| onset | 短描边、rail impulse、motif accent | 每次 onset 全屏闪烁 |
| energy | field density、bloom、环境速度 | 改写歌词位置 |
| bass | depth、cover weight、particle radius | 大幅缩放歌词 master |
| brightness | contrast、prism、highlight | 高频颜色抖动 |
| stereo width | duet spread、field spread | 影响歌词时间 |
| silence | freeze、vacuum、desaturate | 假装检测到准确 beat |

AI 只选择“特征映射到哪个目标”和 gain 范围，不能看到或输出逐帧值。

---

## 九、招牌演出设计

### 9.1 记忆点的定义

一个强事件至少满足：

1. 有 1–2 个场景或若干歌词行的 anticipation。
2. event 与明确歌词、结构、声部或音乐变化同步。
3. 同时改变至少两个层，Hero 事件至少改变三个层。
4. event 后留下 trace、absence、reframe 或 accumulation。
5. 后续至少有一次 recall 或 resolution。

只改变颜色、粒子数量或加一个 glow，不算 signature choreography。

### 9.2 建议层级

四分钟平衡歌曲的软目标：

- 16–20 个 Scene Beat。
- 6–8 个 dramatic beat。
- 其中只有 2–3 个 Hero/full-stage event。
- motif 至少出现三次：seed → transform/fracture → return/resolve。
- restrained lyric time 约 25–35%，但普通逐句 motion 仍然存在。

“6–8 signature”这个说法容易让所有事件都被当作高潮，因此建议术语调整为：

- `dramatic beat`：中等结构事件。
- `hero event`：真正全舞台接管。
- `motif touch`：小规模母题出现或回忆。

### 9.3 首批建议制作的编舞

优先 8 个，不必一开始做 12 个：

1. `hook.expand`
2. `duet.bridge`
3. `silence.vacuum`
4. `rupture.snap`
5. `memory.imprint`
6. `question.suspend`
7. `cover.portalReveal`
8. `final.return`

覆盖重复副歌、对唱、静音、语义破裂、记忆、问句、封面参与和最终回归，足以验证系统价值。

---

## 十、密度策略：软目标，不是安全 Schema

### 10.1 建议 Profile

| Profile | Scene target | Semantic cue coverage | Restrained time | Dramatic beat | Hero |
|---|---:|---:|---:|---:|---:|
| restrained | 18–26s | 35–55% lines | 35–45% | 4–6 | 1–2 |
| balanced | 12–18s | 55–75% lines | 25–35% | 6–8 | 2–3 |
| maximal | 8–14s | 70–90% lines | 15–25% | 7–9 | 3 |

注意：Semantic Cue 可以是稀疏的，最终每句仍有本地编译动作，因此 cue coverage 不等于 visible line animation coverage。

### 10.2 硬合同与软艺术预算的边界

```text
硬合同
  timing / identity / exact text / coverage / state
  concurrency / provider budget / safe area
  registered primitives / conflicts / reduced motion

软预算
  scene count / cue coverage / quiet share
  dramatic beat count / Hero count / style diversity

艺术评测
  memorable / coherent / musical / readable / tiring
```

某首歌曲偏离软目标时应产生 review warning，而不是直接把 AI 结果判为无效，除非它违反可读性、安全或连续性。

---

## 十一、Director Review 工具范围

### 11.1 推荐第一版

第一版是内部审片工具，不是完整商业编辑器：

- 真实歌曲预览。
- Scene、Semantic Cue、dramatic beat 列表。
- 时间 seek。
- V1/V2 A/B。
- density profile 切换。
- lock/unlock scene。
- regenerate one future window。
- 查看 fallback、validation、coverage 和艺术 warning。

### 11.2 推迟功能

- 任意关键帧编辑。
- 多轨时间线。
- 用户拖动所有场景边界。
- 完整 undo/redo history。
- 外部插件。
- 风格市场。
- 视频导出。

如果内部评测证明用户确实频繁需要逐句修正，再决定是否扩展为产品级 Director Studio。

---

## 十二、视觉风格系统

### 12.1 第一阶段不要做插件生态

先使用静态注册表：

```ts
const visualIdentityPacks = {
  editorialSignal: { /* compatible clips/effects/layouts */ },
  inkWeather: { /* ... */ },
  paperTheatre: { /* ... */ },
};
```

只有当至少 6 个风格已经实际完成，并暴露出稳定的共同接口后，再版本化为正式 Pack Contract。

### 12.2 判断两个风格是否真正不同

关闭颜色或转成灰度后，仍应在以下至少三个方面不同：

- 空间构图。
- 字体比例与排版法则。
- 运动节奏。
- motif 行为。
- 封面角色。
- transition grammar。
- environment physics。

只换 palette、blur 和粒子纹理不能算新风格。

---

## 十三、建议实施阶段

### 阶段 0：艺术原型验证

目标：用最少系统改造证明“更多 AI authorship”确实改善画面。

- 手工准备 5 首代表歌曲的理想 Scene Beat 和 Semantic Cue fixture。
- 在现有 renderer 上编译，不修改 provider。
- Theatre.js 制作 4 个最关键编舞。
- V1/V2 本地 A/B。

退出条件：用户能明显分辨 V2，能够复述至少一个母题和两个事件，并认为可读性没有下降。

### 阶段 1：Multi-scene ScenePackV2

- 一个请求输出多个 Scene Beat。
- 保持现有请求并发、尝试次数和缓存边界。
- Scene 数量使用软目标。
- 整包必须在覆盖和连续性上合法。

退出条件：四分钟代表歌曲可得到约 16–20 个稳定场景，seek/cache replay 确定。

### 阶段 2：Semantic Cue + Performance Compiler

- AI 只标注意义明确的歌词行。
- Compiler 映射到已有 directive、gesture、effect 和 motion clip。
- 普通行继续有本地动作。

退出条件：观众能从动作判断问句、回答、重复、破裂和回收；Schema 失败率和输出大小保持可接受。

### 阶段 3：8 个招牌编舞与戏剧转场

- Theatre.js 内制作编舞。
- 导出静态 MotionClip。
- DOM 使用 WAAPI currentTime。
- Canvas/Pixi 使用现有权威时间采样。

退出条件：8 个编舞不依赖颜色也能区分，pause/seek 中间状态正确。

### 阶段 4：Reactive Bus

- 只实现稳定的六个特征。
- 不实现自研 beat tracker。
- 音频不可用时完整降级。

退出条件：onset 反应 p95 <=120ms，捕获丢失不产生画面骤停或错误。

### 阶段 5：内部 Director Review

- 真实歌曲审片、A/B、锁定、局部重生成和 warning。
- 不做完整关键帧编辑器。

退出条件：艺术问题可以被定位到具体 Scene/Cue/Clip，并能局部纠正。

### 阶段 6：视觉风格与评测扩展

- 根据实际动作库形成 3–6 个真正不同的风格。
- 5 首歌通过后扩展到 12 首歌矩阵。
- 完成 blind preference 和 moment recall。

退出条件：V2 在整体偏好、记忆点、重复副歌升级和可读性上超过 V1。

### 阶段 7：Shadow / Opt-in / Default-on

- Shadow 生成但不渲染。
- Opt-in 真实 Chrome 测试。
- 通过艺术和工程门槛后才 default balanced。
- 保留 restrained、V1 和 local fallback。

---

## 十四、评测设计

### 14.1 工程指标

- Provider 仍然一次只运行一个请求。
- 全曲最多 6 次 provider attempt、90 秒 provider wall time，除非另行评审。
- 无 raw audio、key、endpoint、prompt 或 response 持久化。
- 同一 `timeMs` 在 pause/seek/replay/cache 中得到相同渲染状态。
- renderer p95 建议 <=8ms，且不比 V1 同 fixture 慢超过 20%。
- Reactive onset 到可见反应 p95 <=120ms。
- reduced motion 不改变 scene timing、identity 和 cache。

### 14.2 艺术指标

建议评分：

- Readability：歌词是否毫不费力可读。
- Semantic fit：动作是否与歌词功能/含义相关。
- Musical fit：是否跟结构、能量和声音变化同步。
- Coherence：是否像同一场演出，而非 preset 拼接。
- Distinctiveness：与其他歌曲是否有明显区别。
- Surprise：是否有真正意外但合理的事件。
- Fatigue：是否过度刺激。
- Recall：结束后能否描述母题和具体事件。

### 14.3 初期 5 首矩阵

1. 快歌。
2. 慢歌。
3. 重复副歌。
4. 对唱/重叠声部。
5. 长句/低粒度 timing。

初期由产品所有者和至少一位外部专业人士观看即可；不必一开始组织正式多人实验。

### 14.4 默认开启前 12 首矩阵

在上述基础上增加：

- 快速 Rap。
- 大段 instrumental gap。
- line-only timing。
- 中、日、英和混合语言。
- 明亮、暗色和构图复杂封面。

---

## 十五、主要风险

### 15.1 艺术密度变成机械指标

风险：模型为了达到场景数量而频繁切换。

缓解：数量为软目标；切分必须有结构或语义证据；允许有理由地偏离。

### 15.2 AI 输出变大、变慢、变脆弱

风险：多 Scene 加逐行完整对象导致响应延迟和 Schema 拒绝率增加。

缓解：稀疏 Semantic Cue；一个窗口一个请求；本地补齐普通行。

### 15.3 音频反应漂移或抖动

风险：错误 beat phase、快速特征抖动、消息延迟。

缓解：V1 不使用 beat phase；平滑、迟滞、latest-frame-wins 和 neutral decay。

### 15.4 DOM 与 Canvas 不同步

风险：封面和歌词在 transition 中处于不同进度。

缓解：共享 transition record 和权威 `timeMs`；WAAPI currentTime 与 Canvas sampler 同源。

### 15.5 招牌场面失去招牌意义

风险：6–8 个事件全部变成 Hero。

缓解：区分 motif touch、dramatic beat 和 Hero；Hero 软上限 2–3。

### 15.6 编辑器吞噬产品开发

风险：为调动画开发完整时间线软件。

缓解：Theatre.js 内部制作；Director Review 第一版只做审片和局部修正。

### 15.7 风格系统过早抽象

风险：没有真实风格就先设计插件协议。

缓解：先用静态注册表完成 3–6 个风格，之后再抽象。

### 15.8 扩展包体和运行性能上涨

风险：大量 clip、vector、Studio 或新库进入生产 bundle。

缓解：Studio 保持 dev-only；clip 为轻量静态数据；pack renderer 懒加载；保持现有 bundle/module gates。

---

## 十六、希望专家重点回答的问题

### 16.1 给动画导演 / 创意总监

1. 四分钟歌曲 16–20 个 Scene Beat 是否合理？哪些类型歌曲应明显更少或更多？
2. 6–8 个 dramatic beat、2–3 个 Hero 是否能形成足够记忆点，又不造成疲劳？
3. “一个母题三次触达：seed → transform/fracture → return/resolve”是否足够形成整曲记忆？
4. restrained time 25–35% 是否合适？quiet 应如何表现才不是静止？
5. 首批 8 个 choreography clip 是否覆盖了最重要的歌词视频场景？缺少什么？
6. 哪些动作最容易显得廉价、模板化或“AI 味重”？
7. 重复副歌最有效的升级路径是什么：规模、速度、空间、声部、母题还是信息密度？

### 16.2 给创意技术总监 / 动效工程师

1. Semantic Cue → Performance Compiler → MotionClip 的分层是否正确？
2. 是否应该让 AI 为每句输出 cue，还是只标注意义强的歌词行？建议比例是多少？
3. Theatre.js authoring → 静态 MotionClip runtime 是否是合理复用，还是会产生双重格式维护？
4. DOM 使用 WAAPI currentTime、Canvas/Pixi 使用自有 sampler，会不会产生难以控制的同步误差？
5. Scene Beat 的 8–20 秒目标是否适合实时歌词舞台？
6. 哪些参数应该由音频逐帧驱动，哪些必须保持导演控制？
7. 是否需要在 V1 Reactive Bus 中加入 tempo/beat phase，还是应继续推迟？

### 16.3 给实时图形工程师

1. 当前 Pixi environment + Canvas lyric + DOM artwork 三层结构是否应该整合？
2. 如果整合，最合理的是全部 Pixi、Canvas+DOM，还是保留当前混合结构？
3. 15Hz feature forwarding + rAF interpolation 是否足够？
4. p95 <=8ms、相对 V1 不超过 20% 回退是否是合理门槛？
5. 怎样实现 memory trace 和多 Scene transition，才能避免重复分配和 GPU/Canvas 抖动？
6. WAAPI paused animation 的 currentTime 采样在 Chrome 扩展环境是否有需要特别注意的成本或精度问题？

### 16.4 给产品/工具设计专家

1. 第一版 Director Review 只做 A/B、锁定、局部重生成是否足够？
2. 用户真正需要修改的是场景、关键词、密度、风格还是具体动作？
3. 哪些功能必须留给内部 Theatre.js 工具，哪些值得进入产品？
4. 是否应向普通用户暴露 restrained/balanced/maximal，还是使用更直观的语言？

---

## 十七、希望专家采用的反馈格式

为了便于行动，希望反馈尽可能使用：

```text
问题编号：
严重程度：致命 / 高 / 中 / 低
涉及阶段：
当前设计哪里不合理：
为什么：
建议修改：
是否有成熟工具/论文/项目可以复用：
建议验证方法：
```

另外希望专家给出三个结论：

1. **应该立即做的三项**。
2. **应该删除或推迟的三项**。
3. **判断演出是否“令人印象深刻”的最小可行验收标准**。

---

## 十八、不可妥协的项目边界

- YouTube Music 保持播放与权威时间所有权。
- AI 失败必须回到完整本地演出。
- 模型不能输出或执行代码、SVG、shader、路径、坐标、颜色和关键帧。
- API Key 只保存在扩展本地，不进入日志、缓存、fixture、文档或部署。
- 原始音频和 PCM 不持久化、不发送给 AI。
- 过去场景不能被未来 AI 请求改写。
- pause、seek、replay、cache replay 必须确定。
- reduced motion 是完整设计分支，不是事后关闭动画。
- 不把 provider 或网络请求放进帧循环。
- 不因为追求艺术冲击力而降低歌词可读性。

---

## 十九、相关源码入口

- `packages/performance/src/rollingDirector.ts`：Bible、Scene Card、连续状态、Rolling 编译。
- `packages/performance/src/rollingDirectorPrompt.ts`：Bible/Scene JSON Schema 与 prompt。
- `packages/performance/src/directorPlan.ts`：现有 plan、line directive、本地 Director、MusicMap 融合。
- `packages/performance/src/lyricChoreography.ts`：歌词 gesture、blocking、exact text 验证。
- `packages/performance/src/effectGrammar.ts`：effect primitive 和 effect card。
- `packages/performance/src/dramaticScore.ts`：act、motif、signature、quiet、recall。
- `packages/performance/src/motionClip.ts`：当前 MotionClip 轨道与 sampler。
- `packages/renderer/src/prepareDirected.ts`：歌词几何、gesture 和 dramatic moment 准备。
- `packages/renderer/src/drawDirected.ts`：歌词、场景、effect 和 gesture 绘制。
- `packages/renderer/src/drawDramatic.ts`：motif actor 和 dramatic scene 绘制。
- `apps/stage/src/StageCanvas.tsx`：权威时钟采样、plan handoff、Canvas 与 DOM Stage。
- `apps/stage/src/PerformanceEnvironment.tsx`：Pixi/Canvas2D 环境。
- `apps/performance-lab/src/App.tsx`：当前 fixture-only Lab。
- `apps/performance-lab/src/theatreAuthoring.ts`：当前 Theatre.js 集成。
- `apps/browser-extension/src/offscreen-audio.ts`：本地音频分析。
- `apps/browser-extension/src/background.ts`：BYOK、cache、request ledger、capture ownership。

---

## 二十、当前建议结论

现阶段最值得实施的最小闭环是：

```text
Multi-scene ScenePack
  + sparse Semantic Cue
  + existing Performance Compiler/renderer
  + 8 Theatre-authored signature clips
  + six-field local Reactive Bus
  + five-song A/B review
```

只有当这个闭环证明 V2 明显更有记忆点，同时保持可读性、稳定性和成本边界后，才继续投入完整 Director Studio、正式 Visual Identity Pack Contract 和更大规模艺术评测。

这份方案希望解决的并不是“让画面动得更多”，而是：

> 让每一次运动都有歌词、音乐或叙事原因；让整首歌有可以被观众记住的视觉承诺、变化和回收。
