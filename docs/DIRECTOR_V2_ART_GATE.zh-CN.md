# Director V2 受控艺术门

## 当前状态

```text
Architecture: Frozen
Performance candidate: 990e364
Review tooling: post-candidate, non-performance code only
Engineering gate: Provisionally passed
Artistic gate: Awaiting review
WindowIntentV2 provider: Enabled by owner override; artistic quality unreviewed
```

2026-08-24，产品所有者明确表示没有时间执行盲测，并授权继续升级。该决定允许接入有界 `WindowIntentV2` provider，但不把艺术门伪记为通过；Recipe、渲染原语和四个实验条件仍保持冻结。

## 工具已经自动完成的部分

Performance Lab 现在会：

- 按 reviewer code 为五个 fixture 生成可复现、彼此不同的随机顺序；
- 每首歌重新映射 `K/M/R/T`，观看者界面不显示 A/B/C/D、Recipe、branch 或 primitive；
- 要求每个版本从 0:00 完整播放到结尾，之后才解锁评分；
- 保存十个 1–5 分维度、七个即时回忆问题、三组盲比较、灰度判断、特殊 fixture 判断、时间点评论和异常；
- 将每个 reviewer 的记录隔离保存在本机 `localStorage`；
- 只有评分完成后才显示解盲 Gate Report；
- 只在全部严格阈值与全部工程硬门通过时输出 `AI Shadow: allowed`；
- 对 B≈A、B≈C、B≈D、记忆失败、gap、灰度、可读性和疲劳生成固定失败归因；
- 允许复制包含盲标映射、原始评分和报告的完整 JSON。
- 单个 reviewer 即使通过也保持 `AI Shadow: blocked`；导入第二位 reviewer 的独立 JSON 后才生成 Combined Gate Report。

判定器不会根据文本内容猜测“回答得好不好”，也不会自动替人类确认母题或两个事件。观看者必须明确标记能否复述。

## 仍必须由人完成的部分

当前五个 fixture 是合成歌词与确定性时间数据，Performance Lab 不包含真实音频。因此它可以验证协议、演出差异和时间行为，但不能单独证明真实歌曲上的 musical fit。

正式 session 必须由主持人保证：

1. 使用同一音轨、音量、设备、窗口尺寸和 build。
2. 观看者包括项目所有者，以及至少一位不知道实现细节的外部观看者。
3. 两人使用不同 reviewer code，按各自 UI 顺序完整观看 20 个条件；需要时拆为两次 session。
4. 每次观看结束先完成回忆和评分，再重播或查看时间线。
5. 灰度只用于关键片段的第二次检查，第一次完整播放保持正常颜色。
6. 主持人独立验证工程硬门并记录证据；不能用艺术高分抵消硬门失败。
7. 两位 reviewer 的 JSON 分别保留，不在中途合并或针对弱 fixture 改代码。

## Lab 操作

```bash
npm run dev:performance
```

1. 打开 Performance Lab。
2. 输入不含身份信息的 reviewer code，例如 `owner-session-1` 或 `external-session-1`。
3. 点击“开始独立随机 Session”。
4. 按五个 fixture 的编号顺序，按四个 Version 的编号顺序播放。
5. 每次从 0:00 点击 Play，播放到结尾；不要拖动时间线代替完整观看。
6. 填完当前 Version 的十项评分与即时回忆。
7. 四个 Version 完成后填写三组盲比较与灰度判断。
8. 重复副歌和 slow gap 还要填写各自的专项判断。
9. 记录具体时间点评论与所有 runtime/seek 异常。
10. 所有 fixture 完成后填写工程硬门，查看解盲报告并复制 JSON。
11. 主持人把另一位 reviewer 的完整 JSON 粘贴到合并区；只有两个不同 reviewer code 都严格通过，Combined Report 才能放行 AI shadow。

## 严格产品阈值

- B>A 至少 4/5；
- B>C 至少 4/5；
- B>D 必须在五个 fixture 中均可观察；
- 母题与两个事件的回忆至少 4/5；
- 重复副歌明确有一次升级与一次最终回收；
- slow gap 不像断电、屏保或停住；
- 五个 fixture 的灰度分支均可区分；
- 每首 B 的 Readability 不低于 A；
- 每首 B 的 Fatigue resistance 不低于 3/5；
- 九项工程硬门全部通过。

只有至少两位不同 reviewer 的报告都严格 `Pass`，Combined Gate Report 才允许开始 WindowIntentV2 AI shadow。工具无法验证观看者是否真的属于外部人员，主持人必须保证至少一位不了解实现细节。`Conditional Pass` 仅表示架构未被推翻、存在一个已分类的局部问题；修复并重跑受影响 fixture 前，AI shadow 仍然阻塞。

## 工程证据边界

自动测试可以支撑 StageFrame 重建、local fallback、cache 前缀和协议判定，但以下结论仍需要当前 build 的真实运行证据：

- Canvas、Pixi、DOM 在随机 seek 后的视觉一致性；
- pause、hidden resume 与 replay 的真实浏览器状态；
- Canvas2D fallback 的事件时点；
- A/B 的遮挡与实际可读性；
- Lab、Stage 和最终扩展运行时无错误。

不要把 `npm test` 或一次本地 Lab 打开等同于完整艺术门通过。
