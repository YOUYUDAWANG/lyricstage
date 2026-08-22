# Light Control Room UI/UX plan

Status: approved for implementation, 2026-08-23.

## Product idea

LyricStage has two visual responsibilities that must not compete:

- the backstage surfaces (popup and settings) make state, configuration, and recovery predictable;
- the performance surfaces (Column and Fullscreen) carry the song's visual expression.

The backstage interface therefore uses a quiet, light control-room language: warm neutral background, white working surface, thin separators, compact typography, one accent color, and no ambient gradients or decorative glass.

## Information architecture

### Settings

- Keep one stable split view: a restrained left navigation rail and one content column.
- Remove the floating toolbar and repeated section/card title. Each page has one title, one description, and one status.
- Use grouped rows rather than cards nested inside cards.
- Keep ordinary controls visible; put custom endpoints and fallback-provider details behind progressive disclosure.
- Keep the primary action in a stable footer. Show saving state and whether the current draft differs from the saved configuration.

### AI Director flow

1. Choose a provider protocol.
2. Enter or replace the API key. Explain when an existing key will be reused.
3. Connect to request the exact origin and retrieve the provider's model list.
4. Choose a returned model explicitly.
5. Optionally reveal the custom endpoint and fallback provider.
6. Save and enable.

Errors belong next to the connection action and must explain the next useful step. A saved model remains visible, but the UI must distinguish saved configuration from a freshly verified connection.

### Popup

- Treat the popup as a remote, not a miniature settings page.
- Keep current track/status, one primary Stage action, two quick performance toggles, and three concise destinations.
- Move privacy prose to Settings.
- Use an independent live region for failures instead of replacing artist metadata.
- Revert optimistic preference switches if persistence fails.

## Destructive and unsaved state

- Replace ambiguous `停用` labels with explicit `删除配置与 Key` wording.
- Require confirmation immediately before deleting local provider credentials.
- Show `有未保存修改` when a settings draft changes and provide `取消修改`.
- Disable the save action only when required data is missing, and explain the missing step nearby.

## Visual system

- Page background: `#f4f4f1`; sidebar: `#ecece8`; work surface: `#ffffff`.
- Primary text: `#191a1c`; secondary: `#696c73`; separator: `#dedfda`.
- Accent: `#4169e1`, limited to the selected destination, primary action, focus, and connected state.
- Default radius: 8px; major containers: 12px; no pill unless the content is truly a compact status.
- Minimum popup text: 11px; ordinary settings text: 13px; page title: 28px.
- Use one monochrome SVG icon family. Do not use text glyphs as interface icons.
- Interactions use property-specific transitions under 200ms and immediate `:active` feedback. Reduced-motion removes transforms.

## Acceptance criteria

- At 1280×720, the active page title appears once and the primary workflow fits without horizontal scrolling.
- Provider setup reads in the order protocol → key → connect → model; custom endpoint is secondary.
- A failed model-list request stays attached to the provider action and never changes unrelated metadata.
- Popup text is legible at default Chrome scaling and contains no paragraph-length privacy copy.
- Failed preference persistence restores the previous switch state.
- Existing BYOK storage, exact-origin permissions, model discovery, deterministic fallback, and the original unpacked extension identity remain unchanged.
