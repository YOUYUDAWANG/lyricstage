# LyricStage 体验加固方案

基线：`origin/main@82a5e21`。本轮只处理 YouTube Music 扩展、歌词运行时、BYOK Director、设置与演出体验；Bilibili Provider 继续延期。

## 目标

1. 换歌时，标题、歌手、封面、进度和控制权必须属于同一首歌。
2. 任一网络、缓存、模型或 MV3 生命周期故障都必须有截止时间、可恢复路径和本地确定性降级。
3. 设置页只展示真实可用模型；配置失败不能表现成“按钮没反应”或“未配置”。
4. Column 与 Fullscreen 在长歌词、高 DPI、轻量模式和减少动态下保持可用。
5. 扩展默认不启动人声分析，也不提供本地歌词上传入口。

## 修复顺序

| 优先级 | 问题 | 修复策略 | 验证 |
| --- | --- | --- | --- |
| P0 | 元数据先变、video ID 后变导致旧控件操作新歌 | 以播放器身份为主证据；新 ID 与新元数据稳定后原子提交；过渡期 seek/transport fail closed | metadata-first、旧封面、地址栏滞后、连续媒体时间轴回归 |
| P0 | 歌词请求永久等待、缓存配额导致成功结果丢失 | 16 秒全链路 deadline；AbortSignal 贯穿来源；缓存读写 best-effort；1.5MB 字节预算 | never-resolving source、quota、single-flight 恢复 |
| P0 | 多标签页 Rolling 相互作废、切歌后旧 BYOK 继续收费 | 按 tab owner 隔离 generation/ledger；同 owner 换歌中止旧请求 | 双标签并行与快速切歌 abort 回归 |
| P1 | 设置保存错误隐藏、模型列表混入不可用类型 | dirty 与 operation error 分离；显式 loading/error/retry；只列探测成功的文本模型 | 设置 model/client 单测与真实设置页 |
| P1 | Column 每帧重渲染、全屏双 rAF 与重复场景编译 | Column 状态降至 20Hz/轻量 5Hz；统一全屏 frame coordinator；缓存环境 scene | 类型检查、帧耗时指标、真实 Chrome Performance |
| P1 | 轻量/减少动态名不副实、高 DPI 显存无上限 | 静态环境采样、减少粒子/光圈/blur、DPR 1、4K 级 backing-store 预算 | 320px/720px/Retina 与系统偏好切换 |
| P1 | 菜单、键盘、焦点和失败反馈不完整 | 移除无效入口；dialog 焦点闭环；roving tabindex；seek/transport 状态提示；手动搜索/重连 CTA | Shadow DOM `F`、Esc、键盘 scrub、读屏状态 |
| P2 | DOM mutation storm 与冷全屏 | 定向 observer、字段签名去重、4Hz 上限、Stage bundle 有界预热 | mutation-storm 回归、冷/热全屏 UAT |

## 发布门禁

- 聚焦回归与 `npm test` 全部通过。
- `npm run typecheck`、`npm run build:all`、模块/包体/CSP 门禁通过。
- Director gateway 测试及 `npm audit --audit-level=high` 通过。
- 连续两次构建产物哈希一致。
- 只把审阅后的产物镜像到稳定目录 `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist`。
- 重载原扩展 ID `majlfdidelchofnfodcijoppcgpmbelc`，真实验证换歌、seek、歌词 miss 恢复、BYOK 失败降级、轻量模式和设置模型发现。

## 不在本轮范围

- Bilibili 浏览器 Provider。
- 重新引入本地歌词上传或人声增强。
- 依赖 Director gateway 才能播放歌词；BYOK 或服务失败时始终保留本地演出。
