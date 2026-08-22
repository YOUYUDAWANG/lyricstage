# LyricStage for YouTube Music

这是 LyricStage 的 Chrome / Edge Manifest V3 伴生扩展。YouTube Music 继续拥有账号、音频和播放时钟；扩展只传递当前歌曲元数据与播放位置，并使用公开只读歌词源自动寻找同步歌词。

## 形态（增强原生歌词模式）

- **增强原生歌词**：原生 Lyrics 是唯一入口；扩展 `ColumnStageView` 挂载在原生 Lyrics renderer 内部，不新建同级自定义标签，不删除原生歌词 DOM。
- **侧栏 Column Stage**：React DOM 垂直歌词流，通透轻盈地融入 YouTube Music 原生界面（透明背景、自适应字号、柔和临近行与连续逐字扫亮），含 compact 工具栏（来源状态、版本、导入、全屏）。
- **手动歌词搜索**：侧栏放大镜可直接改写歌名与歌手（歌手可留空），重新查询 LDDC、LRCLIB 与酷狗；结果只作为候选展示，用户选择后才绑定当前 YouTube Music track 并写入本地缓存，不会因手动输入绕过候选签发与曲目切换失效检查。
- **LDDC 原生逐字**：LDDC 返回 `timingKind=word` 时，扩展保留 QRC/KRC/YRC 的行/字毫秒轴并直接生成 `LyricDocumentV0.words`；Column 与 Fullscreen 共用这些真实时间连续扫亮。逐字越界、倒退、空值或数量异常会拒绝该候选；只有逐行词时保持整行高亮，不平均分字，也不上传音频做 Forced Alignment。
- **全屏 Fullscreen Stage**：侧栏右上角全屏按钮或快捷键 `F` 进入 Performance Runtime；PixiJS WebGL 负责抽象环境，Canvas2D 负责 CJK/逐字正文，封面不会直接铺到背景。标题/歌手只在开场短暂出现；`Esc` 只退出全屏并回到当前 Lyrics Column。
- **本地导演始终可用**：每首歌按真实歌词结构、重复 Hook、声部重叠与 recording identity 编译确定性 `DirectorPlanV1`；离线、未配置 AI、超时或响应无效都保持完整演出。
- **可选全屏 AI 导演（BYOK）**：扩展直接调用用户选择的 OpenAI Responses、OpenAI-compatible、本地模型、Gemini 或 Anthropic Messages API，不再依赖固定 LyricStage Director 服务器。主供应商可配置一个备用供应商；模型输出必须先经过扩展内与服务端同源的 Performance Direction Skill、严格合同与本地 plan 适配，失败会重试、切备用，最终回到完整确定性演出。Key 仅保存在 `chrome.storage.local`，不会进入计划缓存、日志或构建产物。
- **原唱识别保持证据边界**：通用 BYOK 文本接口不能保证联网 grounding，因此扩展不再把模型自写的作品身份当成搜索事实；当前只使用标题中可验证的 cover/original credit 与确定性歌词候选规则。原有 OCI `/v1/music/identity` 服务保留作历史/独立服务，但不再是 Companion 运行依赖。
- **两档运动预算**：轻量模式遵守 reduced-motion；显式个人 VJ 模式提高全屏环境强度，但系统 reduced-motion / 轻量模式仍拥有最终优先级。
- **安全恢复模型**：原生歌词节点在增强态下仅隐藏（保留 display / hidden / aria-hidden / inert），切换到 Up next、Comments、Related、页面导航、扩展停用或 context 失效时精确恢复原生歌词节点。
- **故障边界保护**：Column React 运行时作为独立打包的 content script 直接挂进扩展 Shadow DOM，不再依赖被 YTM 拦截的 extension iframe。只有 React 提交并发出可信 ready 后才隐藏原生歌词；运行时缺失、渲染错误或超时都会保留原生内容，不留下空白面板。

## 本地安装

1. 在仓库根目录运行 `npm run build:extension`。
2. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
3. 选择“加载已解压的扩展程序”，载入根目录的 `extension-dist`。
4. **重新加载扩展**并刷新 YouTube Music；播放歌曲后点击原生「歌词 / Lyrics」标签，或从扩展弹窗激活。

切换到「接下来播放」、「评论」或「相关内容」会自动恢复原生节点；在全屏状态按 `Esc` 可返回侧栏 Column。宿主音乐不会被接管。

扩展会在换歌后按 `videoID + 标题 + 歌手 + 时长` 先查本地缓存，再进行分层查询：

- 本地标题解析按角色分层：先确认 cover marker，再剥离 `covered by / Cover: / Vocal:` 翻唱者 credit 与 acoustic 等版本包装，最后解析「歌名（原唱）」或「歌名 / 原唱」中的明确原唱；`/／|｜-—` 只是结构分隔符，不会残留进规范歌名；
- 首轮未命中当前翻唱录音时，不会让通用 BYOK 模型伪造联网原唱证据；本地清洗结果只作为可能有误的搜索提示，不会直接被当成事实；
- LRCLIB 先尝试歌名、歌手、时长精确匹配，失败后按原文歌名和别名做不带歌手的回退；
- 酷狗作为第二个公开只读同步歌词源；可在扩展弹窗中配置用户自己的 LDDC 地址与 Bearer，继续聚合网易云、QQ 和酷狗，并在来源提供 QRC/KRC/YRC 时保留真实逐字轴；
- 自动采用顺序固定为翻唱同版本优先、已证明原唱次选：标题、翻唱者和时长差不超过 4 秒的同步歌词先装入；标题没有明确原唱时不再按候选多数艺人猜测，因为候选可能全部来自另一位翻唱者。只有标题明确 credit 的原唱才允许时长差不超过 15 秒的结果作为 `originalFallback`，并在界面明确说明使用了原唱歌词；
- 标题不一致或时长相差超过 30 秒的同歌手/同名异曲不会进入候选；
- 不足以自动确认的结果最多 5 条候选供选择；
- 工具栏放大镜可手动输入歌名/歌手重搜；即使某个结果与输入精确匹配，也先展示来源、艺人和时长，由用户明确选择后再采用；
- 没有结果或网络失败时可导入 LRC / LyricStage JSON；
- 已确认结果最多缓存 100 首。

扩展不会读取 Cookie、下载或录制音频、保存媒体 URL，也不调用 YouTube 内部接口。用户进入全屏演出时，扩展可通过 `tabCapture` 在本机提取约 30Hz 的能量、频段、音色与结构特征，并立即把同一流重新连接到音频输出；原始音频、PCM、视频与媒体 URL 均不会上传或落盘。发送给用户所选 AI 供应商的是曲目元数据、歌词正文/时序和压缩后的 `MusicMapV1`；通用模型不会收到可冒充“已听完整视频”的媒体附件。LDDC Bearer 与供应商 API Key 都不进入仓库或扩展构建产物，只保存在本机扩展存储。自定义模型域名是可选 host permission，保存时只请求用户填写的精确 origin；HTTP 只接受 localhost、`.local`、RFC1918、link-local 或 Tailscale CGNAT 地址。

## 验证说明

- 自动：companion 生命周期与宿主恢复、Column 状态/逐字进度、DirectorPlan/边界接管/请求隐私、Vitest、typecheck、`build:extension`、CSP、无音频捕获、DEV Studio 生产排除、bundle 上限，以及 `stage.html`/独立 Column bundle/Manifest 加载顺序/源码产物一致性。
- 人工门：reload `extension-dist` 后确认原生歌词增强挂载、Column 不变、全屏 GPU/正文、点击歌词 seek、换歌、暂停、断连恢复和原生 tab 恢复。
